// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
import { queryResourceAction, readResourceAction, updateResourceAction } from "./resource-actions";

/**
 * A post's history: what it said before each change, and a way back to it.
 *
 * The rule that decides is `demoCan`, asked about the post rather than about this table. A revision
 * is not a thing a person browses on its own, it is the history of one post, and the permission
 * that governs reading a post's history is the permission that governs reading the post. So
 * `post_revisions` never needs to be an exposed resource of its own: that keeps one answer to "may
 * this session do this" instead of a second list to keep in step, and it means a role that may read
 * a post may read where that post has been.
 *
 * The write path goes through the exported resource actions rather than the adapter, so a post is
 * read and written by the same boundary the rest of the admin uses. Each operation still asks
 * `demoCan` for itself before it records anything, because the recording happens before the post
 * write and must not depend on a later check having run.
 */

const POSTS = "posts";
const REVISIONS = "post_revisions";

/** The two states the database allows. Anything richer is not modelled, and this says so. */
export type PostStatus = "draft" | "published";

/**
 * What a change did. A person reading the history needs to tell a restore from an edit, and the
 * difference is the whole reason a restore is recorded rather than merely performed.
 */
export type RevisionCause = "edit" | "publish" | "unpublish" | "restore";

/** The content a revision holds and a restore puts back. */
export type PostSnapshot = {
  title: string;
  body: string;
  status: PostStatus;
};

export type PostRevision = PostSnapshot & {
  id: string;
  post_id: string;
  position: number;
  cause: RevisionCause;
  actor_email: string;
  actor_role: string;
  /** The revision a restore put back, so the history says which version was chosen. */
  restored_from: string | null;
  created_at: string;
};

type PostRow = PostSnapshot & { id: string; [key: string]: unknown };

function requirePostPermission(
  session: AdminSession | null,
  operation: "read" | "update",
): AdminSession {
  if (!session) {
    throw new Error("Reading and changing post history needs a session");
  }
  const permission = `posts.${operation}` as AdminPermission;
  if (!demoCan(session, permission)) {
    throw new Error(`This session may not ${operation} posts`);
  }
  return session;
}

function adapter() {
  return demoPersistence().adapter;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Stamped here rather than by the column default, because the memory store has no defaults. */
function now(): string {
  return new Date().toISOString();
}

/**
 * The three fields a revision keeps. Read by name rather than by spreading the row, so a column the
 * history does not describe cannot reach a snapshot by being present.
 */
function snapshotOf(row: PostRow): PostSnapshot {
  return {
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    status: row.status === "published" ? "published" : "draft",
  };
}

async function readPostRow(postId: string): Promise<PostRow> {
  const row = (await readResourceAction(POSTS, postId)) as PostRow | null;
  if (!row) {
    throw new Error(`No post with id ${postId}`);
  }
  return row;
}

async function writePost(row: PostRow, snapshot: PostSnapshot): Promise<void> {
  // The whole row goes out. The SQL adapter sets only the columns it is handed while the memory
  // adapter replaces the record outright, so a partial write would drop a column on one store and
  // keep it on the other, and the demo would pass its tests against the store that is more forgiving.
  await updateResourceAction(POSTS, row.id, { ...row, ...snapshot, updated_at: now() });
}

/** A post's revisions, newest first. Position is the order, because two changes can share a tick. */
async function revisionsOf(postId: string): Promise<PostRevision[]> {
  const rows = (await adapter().query<PostRevision>(REVISIONS, { post_id: postId })) ?? [];
  return rows
    .filter((row) => row && row.id)
    .sort((left, right) => Number(right.position) - Number(left.position));
}

/**
 * Writes the state a change is about to replace.
 *
 * Recorded before the post is written, not after, and the order is the point. A revision id is
 * derived from the post and the next position, so a form submitted twice asks for an id that is
 * already there and is refused, and refusing before the write leaves the post untouched. Recording
 * afterwards would let the same collision write the post twice and the history once, which is the
 * dishonest direction: the history would be missing a change that happened rather than carrying a
 * version that did not.
 */
async function recordRevision(
  postId: string,
  snapshot: PostSnapshot,
  cause: RevisionCause,
  session: AdminSession,
  restoredFrom: string | null = null,
): Promise<PostRevision> {
  const existing = await revisionsOf(postId);
  const position = existing.reduce((highest, row) => Math.max(highest, Number(row.position)), 0) + 1;
  const row = {
    id: `rev_${postId}_${position}`,
    post_id: postId,
    position,
    cause,
    ...snapshot,
    actor_email: session.email,
    actor_role: session.role ?? "",
    restored_from: restoredFrom,
    created_at: now(),
  };
  return (await adapter().create<PostRevision>(REVISIONS, row)) as PostRevision;
}

export async function listPostRevisions(
  session: AdminSession | null,
  postId: string,
): Promise<PostRevision[]> {
  requirePostPermission(session, "read");
  return revisionsOf(postId);
}

/** The post as it stands, which is the one place the current content lives. */
export async function readPost(
  session: AdminSession | null,
  postId: string,
): Promise<PostSnapshot & { id: string }> {
  requirePostPermission(session, "read");
  const row = await readPostRow(postId);
  return { id: row.id, ...snapshotOf(row) };
}

export async function listPostsWithHistory(
  session: AdminSession | null,
): Promise<Array<{ post: PostSnapshot & { id: string }; revisions: number; latest: string | null }>> {
  requirePostPermission(session, "read");
  const posts = ((await queryResourceAction(POSTS)) ?? []) as PostRow[];
  const listed = await Promise.all(
    posts.map(async (post) => {
      const revisions = await revisionsOf(post.id);
      return {
        post: { id: post.id, ...snapshotOf(post) },
        revisions: revisions.length,
        latest: revisions[0]?.created_at ?? null,
      };
    }),
  );
  return listed.sort((left, right) => left.post.id.localeCompare(right.post.id));
}

/**
 * Records a content change and leaves the status alone.
 *
 * There is no status parameter, and that is the workflow. The column is constrained to two values
 * by the database, so a dropdown over it can only ever be a checkbox with two positions; the way to
 * make the transition mean something is to stop it being a field and make it an operation, which is
 * what `publishPost` and `unpublishPost` are. A caller that posts a status here has it ignored,
 * because the two content fields are read by name out of a plain object and nothing else is written.
 */
export async function savePost(
  session: AdminSession | null,
  postId: string,
  input: { title?: unknown; body?: unknown },
): Promise<PostRevision> {
  const actor = requirePostPermission(session, "update");
  const row = await readPostRow(postId);
  const next: PostSnapshot = {
    title: String(input.title ?? ""),
    body: String(input.body ?? ""),
    status: snapshotOf(row).status,
  };
  if (isBlank(next.title)) {
    throw new Error("A post needs a title before it can be saved");
  }
  const revision = await recordRevision(postId, snapshotOf(row), "edit", actor);
  await writePost(row, next);
  return revision;
}

/**
 * Takes a draft live, which is the only way a post becomes published.
 *
 * Refused for a post that is already published rather than quietly accepted, because a second
 * publish event in the history is a claim that something changed when nothing did. Refused for a
 * post with no body, which is the one mistake two status values cannot express: there is no third
 * state for "this is finished", so the check that stands in for it belongs on the transition.
 */
export async function publishPost(session: AdminSession | null, postId: string): Promise<PostRevision> {
  const actor = requirePostPermission(session, "update");
  const row = await readPostRow(postId);
  const current = snapshotOf(row);
  if (current.status === "published") {
    throw new Error(`Post ${postId} is already published`);
  }
  if (isBlank(current.body)) {
    throw new Error(`Post ${postId} has no content to publish`);
  }
  const revision = await recordRevision(postId, current, "publish", actor);
  await writePost(row, { ...current, status: "published" });
  return revision;
}

export async function unpublishPost(
  session: AdminSession | null,
  postId: string,
): Promise<PostRevision> {
  const actor = requirePostPermission(session, "update");
  const row = await readPostRow(postId);
  const current = snapshotOf(row);
  if (current.status === "draft") {
    throw new Error(`Post ${postId} is already a draft`);
  }
  const revision = await recordRevision(postId, current, "unpublish", actor);
  await writePost(row, { ...current, status: "draft" });
  return revision;
}

/**
 * Puts a recorded version back on the post.
 *
 * A real write rather than a view of one: the post row changes, and the content it had is recorded
 * before it goes, so a restore is itself in the history and can itself be undone. A revision is only
 * read through the post it belongs to, so a revision id from another post is refused rather than
 * applied to this one.
 */
export async function restorePostRevision(
  session: AdminSession | null,
  postId: string,
  revisionId: string,
): Promise<PostRevision> {
  const actor = requirePostPermission(session, "update");
  const row = await readPostRow(postId);
  const revisions = await revisionsOf(postId);
  const target = revisions.find((revision) => revision.id === revisionId);
  if (!target) {
    throw new Error(`No revision ${revisionId} belongs to post ${postId}`);
  }
  const current = snapshotOf(row);
  const revision = await recordRevision(postId, current, "restore", actor, target.id);
  await writePost(row, snapshotOf(target));
  return revision;
}
