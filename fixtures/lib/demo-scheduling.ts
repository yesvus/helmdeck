// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
import { publishPost, readPost, type PostSnapshot } from "./demo-revisions";

/**
 * A publish that happens later: the schedule is a row, the moment is somebody's choice, and the run
 * that reaches the moment is the one publish this demo already has.
 *
 * There is no third status and no second history. A scheduled publish goes through `publishPost`, so
 * it lands in `post_revisions` with the cause a hand-made publish gets and the answer to "when did
 * this go live" stays in one place. What is added here is the promise and the thing that keeps it:
 * a schedule names a moment, and `publishDuePosts` is what makes a due moment true.
 *
 * The tables are read through the adapter rather than through `resource-actions`, which is what
 * `post_revisions` does and for the same reason: a schedule is not a resource a person browses on
 * its own, it is part of one post, so the permission that governs it is the permission that governs
 * the post. A second resource in the exposed set would be a second answer to "may this session do
 * this", and the two would drift.
 */

const SCHEDULES = "post_schedules";
const POSTS = "posts";
const USERS = "users";

/** The states a schedule row can hold, which is the column's own list. */
export type PostScheduleState = "pending" | "published" | "cancelled";

export type PostSchedule = {
  id: string;
  post_id: string;
  /** An ISO 8601 instant in UTC. */
  publish_at: string;
  /** One more than the column admits, so a row written by something else reads as itself. */
  state: PostScheduleState | "unknown";
  /** The account the run publishes as, and the role it held when the moment was chosen. */
  actor_email: string;
  actor_role: string;
  created_at: string;
  settled_at: string | null;
  /** Why the last run could not publish this, which is the answer to "why is it still waiting". */
  last_refusal: string | null;
};

export type ScheduledPublish = {
  schedule: PostSchedule;
  /** The post it will publish, or null when the post is gone and the row outlived it. */
  post: (PostSnapshot & { id: string }) | null;
};

export type PublishRun = {
  /** The moment the run was made, which is the clock this module was given rather than the server's. */
  at: string;
  published: Array<{ schedule_id: string; post_id: string; revision_id: string }>;
  refused: Array<{ schedule_id: string; post_id: string; reason: string }>;
};

type Clock = () => Date;

let clock: Clock = () => new Date();

/** The moment the demo reads as now, which is what every due check is made against. */
export function demoNow(): Date {
  return clock();
}

/**
 * The clock the demo reads the moment from, returning the one it replaced so a caller can put it back.
 *
 * A schedule is a claim about a moment, so the moment has to be something the demo can be told
 * rather than something it reads off the machine: a test asks about a moment that has passed without
 * waiting for it to pass, and a host with a clock of its own is not obliged to use the server's.
 * Every operation asks here, so one call moves the answer everywhere.
 */
export function setDemoClock(next: Clock): Clock {
  const previous = clock;
  clock = next;
  return previous;
}

/**
 * The one rule, asked about the post rather than about this table.
 *
 * The guard is the same question `demo-revisions` asks and it answers the same way, which is the point
 * of there being one function: a role that may update a post may schedule its publish, and one that
 * may not may not. A copy rather than a shared import, because that guard is not exported, and
 * extracting it is the change to make when a third caller needs it.
 */
function requirePosts(session: AdminSession | null, operation: "read" | "update"): AdminSession {
  if (!session) {
    throw new Error("Scheduling needs a session");
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

/** A text column as the text that was written, which is what a driver that parses leaves behind. */
function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * A moment, from either form a caller may hold.
 *
 * A `datetime-local` field sends `2026-10-01T09:30` with no zone, and the server and the browser
 * would each read that in their own offset. It is read as UTC here, which is the zone the column
 * stores and the one the page says the field is in, so the moment a person chose is the moment that
 * is written down rather than one that depends on who is looking.
 */
function momentOf(value: unknown): Date {
  const sent = text(value).trim();
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(sent) ? `${sent}Z` : sent;
  const parsed = Date.parse(zoned);
  if (Number.isNaN(parsed)) {
    throw new Error(`"${sent}" is not a moment, which a schedule needs`);
  }
  return new Date(parsed);
}

/**
 * When a row's moment falls, as epoch milliseconds, and never for a row whose moment cannot be read.
 *
 * `Infinity` rather than a sort of last, because a row with a moment nobody can read must not look
 * like one that is merely in the future: the run treats it as a refusal and says so, where a
 * comparison alone would leave it waiting for ever without a word.
 */
function dueAt(publishAt: string): number {
  const parsed = Date.parse(publishAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function toSchedule(row: Record<string, unknown>): PostSchedule {
  const state = text(row.state);
  return {
    id: text(row.id),
    post_id: text(row.post_id),
    publish_at: text(row.publish_at),
    state:
      state === "published" || state === "cancelled" || state === "pending" ? state : "unknown",
    actor_email: text(row.actor_email),
    actor_role: text(row.actor_role),
    created_at: text(row.created_at),
    settled_at: text(row.settled_at) || null,
    last_refusal: text(row.last_refusal) || null,
  };
}

async function allSchedules(): Promise<Array<{ raw: Record<string, unknown>; schedule: PostSchedule }>> {
  const rows = (await adapter().query<Record<string, unknown>>(SCHEDULES)) ?? [];
  return rows
    .filter((row) => row && text(row.id))
    .map((raw) => ({ raw, schedule: toSchedule(raw) }));
}

async function scheduleRow(scheduleId: string): Promise<{ raw: Record<string, unknown>; schedule: PostSchedule }> {
  const row = await adapter().read<Record<string, unknown>>(SCHEDULES, scheduleId);
  if (!row) {
    throw new Error(`No schedule with id ${scheduleId}`);
  }
  return { raw: row, schedule: toSchedule(row) };
}

/** The whole row goes out, because the SQL adapter sets the columns it is handed and the memory one replaces. */
async function writeSchedule(row: Record<string, unknown>, changes: Partial<PostSchedule>): Promise<void> {
  await adapter().update(SCHEDULES, text(row.id), { ...row, ...changes });
}

function requirePending(schedule: PostSchedule): void {
  if (schedule.state === "pending") return;
  const settled = schedule.state === "published" ? "published" : "not waiting on a moment";
  throw new Error(`Schedule ${schedule.id} is already ${settled}, so there is nothing to change`);
}

/**
 * Every schedule, with the post each one names, waiting moments first.
 *
 * Waiting rows come first in the order they will fire, because that is the order a person reads a
 * queue in. Settled rows follow, newest first, because the record of a run that fired is the only
 * thing that shows the tick did anything.
 */
export async function listPostSchedules(session: AdminSession | null): Promise<ScheduledPublish[]> {
  const actor = requirePosts(session, "read");
  const rows = await allSchedules();
  const ordered = [...rows].sort((left, right) => {
    const waiting = (row: PostSchedule) => (row.state === "pending" ? 0 : 1);
    return (
      waiting(left.schedule) - waiting(right.schedule) ||
      (waiting(left.schedule) === 0
        ? dueAt(left.schedule.publish_at) - dueAt(right.schedule.publish_at)
        : Date.parse(right.schedule.settled_at ?? right.schedule.created_at) -
            Date.parse(left.schedule.settled_at ?? left.schedule.created_at))
    );
  });
  return Promise.all(
    ordered.map(async ({ schedule }) => ({
      schedule,
      // A post the schedule outlived is shown as a schedule with nothing to publish rather than as a
      // refusal of the whole list, which is what a row in a store without cascades leaves behind.
      post: await readPost(actor, schedule.post_id).catch(() => null),
    })),
  );
}

/**
 * The drafts a person can still schedule, which are the ones with no moment chosen already.
 *
 * A post that is published cannot be scheduled, because `publishPost` refuses it, and a post with a
 * schedule waiting cannot be scheduled again, because a second one could never fire. Both are
 * refused here so the form is not offered over a claim the run would not keep.
 */
export async function listSchedulablePosts(
  session: AdminSession | null,
): Promise<Array<PostSnapshot & { id: string }>> {
  const actor = requirePosts(session, "read");
  const waiting = new Set(
    (await allSchedules())
      .map(({ schedule }) => schedule)
      .filter((schedule) => schedule.state === "pending")
      .map((schedule) => schedule.post_id),
  );
  const ids = ((await adapter().query<{ id: unknown }>(POSTS)) ?? []).map((row) => text(row.id));
  const candidates = await Promise.all(
    ids
      .filter((id) => id.length > 0 && !waiting.has(id))
      .map((id) => readPost(actor, id).catch(() => null)),
  );
  return candidates.filter((post): post is PostSnapshot & { id: string } => post?.status === "draft");
}

/**
 * A moment chosen for a post, which is a promise and nothing else.
 *
 * The post is checked for publishability before the row is written, because those are the two things
 * `publishPost` refuses and a promise that could never be kept is not a promise. Nothing is published
 * here and no revision is recorded: the post is a draft until its moment, and the run is what makes
 * it live.
 */
export async function schedulePost(
  session: AdminSession | null,
  postId: string,
  publishAt: unknown,
): Promise<PostSchedule> {
  const actor = requirePosts(session, "update");
  const post = await readPost(actor, postId);
  const at = momentOf(publishAt);

  if (post.status === "published") {
    throw new Error(`Post ${postId} is already published, so there is nothing to schedule`);
  }
  if (post.body.trim() === "") {
    throw new Error(`Post ${postId} has no content to publish`);
  }
  const waiting = (await allSchedules()).find(
    ({ schedule }) => schedule.post_id === postId && schedule.state === "pending",
  );
  if (waiting) {
    throw new Error(
      `Post ${postId} is already scheduled for ${waiting.schedule.publish_at}. Move that one instead.`,
    );
  }

  const earlier = (await allSchedules()).filter(({ schedule }) => schedule.post_id === postId).length;
  // Derived from the post and how many rows it already has, the way a revision id is. A moment a
  // person picks twice in one tick would collide on the primary key, and the count is what makes a
  // second row for the same moment a different row rather than a failed insert.
  const id = `sch_${postId}_${earlier + 1}`;
  const created = await adapter().create<Record<string, unknown>>(SCHEDULES, {
    id,
    post_id: postId,
    publish_at: at.toISOString(),
    state: "pending",
    actor_email: actor.email,
    actor_role: actor.role ?? "",
    created_at: demoNow().toISOString(),
    settled_at: null,
    last_refusal: null,
  });
  return toSchedule(created);
}

/**
 * A different moment for a schedule that has not fired, which is what "move it" means.
 *
 * The row's actor becomes the account that chose the new moment, because that is the one the run
 * will publish as: a moment somebody else set is a promise they did not make. The refusal from an
 * earlier run is cleared, because it described a claim nobody is making any more.
 */
export async function moveSchedule(
  session: AdminSession | null,
  scheduleId: string,
  publishAt: unknown,
): Promise<PostSchedule> {
  const actor = requirePosts(session, "update");
  const { raw, schedule } = await scheduleRow(scheduleId);
  requirePending(schedule);
  const at = momentOf(publishAt);

  await writeSchedule(raw, {
    publish_at: at.toISOString(),
    actor_email: actor.email,
    actor_role: actor.role ?? "",
    last_refusal: null,
  });
  return (await scheduleRow(scheduleId)).schedule;
}

/** Calls a schedule off, which settles the row and leaves the post a draft. */
export async function cancelSchedule(
  session: AdminSession | null,
  scheduleId: string,
): Promise<PostSchedule> {
  requirePosts(session, "update");
  const { raw, schedule } = await scheduleRow(scheduleId);
  requirePending(schedule);

  await writeSchedule(raw, {
    state: "cancelled",
    settled_at: demoNow().toISOString(),
    last_refusal: null,
  });
  return (await scheduleRow(scheduleId)).schedule;
}

/**
 * The account a schedule will publish as, with the role it holds now.
 *
 * The email is the row's, and the role is read from the stored account rather than from the copy on
 * the schedule, which is what keeps a demotion from being undone by a promise made before it. An
 * account that is gone, or whose role is not a role string, resolves to a session with no role, and
 * the rule hands that nothing at all.
 */
async function sessionFor(email: string): Promise<AdminSession> {
  const rows = (await adapter().query<{ role?: unknown }>(USERS, { email })) ?? [];
  const role = rows[0]?.role;
  return { email, role: typeof role === "string" ? role : undefined };
}

/**
 * Publishes every schedule whose moment has arrived, and says what it did.
 *
 * This is the whole of the mechanism, and it is a function rather than a timer because the demo has
 * no cron: a host calls it from a worker, a queue or a request, and the page calls it when a person
 * asks for the due ones. It publishes as each schedule's own account, which the rule decides at the
 * moment it fires, so a session is not needed to have made the promise and a role that has been
 * withdrawn stops it being kept.
 *
 * A schedule that cannot be published keeps its moment and records why, rather than being called off:
 * a post emptied after it was scheduled can be written again before the next run, and a run that
 * cancelled the promise would throw that away. A schedule whose moment cannot be read is the same
 * case, because a row nothing can read a moment out of must not sit in the queue looking like it is
 * waiting for a time that will never come.
 */
export async function publishDuePosts(at: Date = demoNow()): Promise<PublishRun> {
  const run: PublishRun = { at: at.toISOString(), published: [], refused: [] };
  const rows = (await allSchedules())
    .filter(({ schedule }) => schedule.state === "pending")
    .map((row) => ({ ...row, due: dueAt(row.schedule.publish_at) }))
    .sort((left, right) => left.due - right.due);

  for (const { raw, schedule, due } of rows) {
    if (!Number.isFinite(due)) {
      run.refused.push({
        schedule_id: schedule.id,
        post_id: schedule.post_id,
        reason: `Schedule ${schedule.id} names a moment that cannot be read: "${schedule.publish_at}"`,
      });
      await writeSchedule(raw, { last_refusal: `The moment "${schedule.publish_at}" cannot be read` });
      continue;
    }
    if (due > at.getTime()) continue;

    try {
      const revision = await publishPost(await sessionFor(schedule.actor_email), schedule.post_id);
      run.published.push({
        schedule_id: schedule.id,
        post_id: schedule.post_id,
        revision_id: revision.id,
      });
      await writeSchedule(raw, { state: "published", settled_at: at.toISOString(), last_refusal: null });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      run.refused.push({ schedule_id: schedule.id, post_id: schedule.post_id, reason });
      await writeSchedule(raw, { last_refusal: reason });
    }
  }

  return run;
}
