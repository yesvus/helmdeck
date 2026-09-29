// SPDX-License-Identifier: MIT
"use server";

import {
  createResourceAction,
  deleteResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "./resource-actions";
import {
  CONTENT_RESOURCE,
  isContentStatus,
  type ContentStatus,
} from "../app/shell/content/content-registry";

/**
 * The demo's posts, over the persistence actions every other resource goes through.
 *
 * Nothing here decides who may do what. A session, the set of resources this admin exposes and
 * `demoCan` are all resolved inside `resource-actions`, which is the one boundary a resource name
 * crosses on its way to a table, and a second decision here would be the disagreement this demo has
 * already paid for once: a button that renders and then fails, or a hidden one whose action succeeds
 * anyway. These actions add what is specific to content, which is the value domain of three columns.
 *
 * **The value domain is checked here because the in-memory store cannot check it.** `posts.status`
 * carries a CHECK constraint and `posts.title` a `length(trim(title)) > 0`, and a database that
 * refuses a value is a guarantee no code can take away. The demo falls back to an in-memory adapter
 * whenever no database is configured, and that adapter enforces nothing, so without the checks below
 * a request that named a status the schema forbids would be stored and the list would show it. The
 * checks are the same two constraints, asked before the write so both stores answer alike.
 *
 * A value that leaves the store is coerced back to the text it was written as, because the driver
 * parses a text column that happens to be valid JSON: a title of `42` arrives as the number 42 and
 * one of `null` arrives as nothing at all. Read as a number, a list renders it correctly by luck and
 * a form writes it back as a string; read as nothing, a post called "null" loses its name.
 */

export type ContentPost = {
  id: string;
  title: string;
  body: string;
  /** The stored value, which the column constrains to `ContentStatus` and this type does not assume. */
  status: ContentStatus | string;
  author_id: string | null;
  position: number;
};

type StoredRow = Record<string, unknown>;

/** A text column as the text that was written, whatever the driver made of it on the way back. */
function storedText(value: unknown): string {
  if (typeof value === "string") return value;
  // An absent key is an empty column. A null is not: the columns this reads are NOT NULL, so the only
  // way one arrives as null is the driver having parsed the four letters, and writing back an empty
  // title would quietly swallow a post's name.
  if (value === undefined) return "";
  return String(value);
}

/**
 * A value on its way into a text column, which is the opposite question to the one above.
 *
 * A key the caller did not send is left out rather than written as an empty string, so an update
 * touching one column cannot blank another. A null the caller did send is an empty field, because the
 * form sends null for a field it found absent and this is what a person clearing a field means.
 */
function writtenText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * A position, or the end of the list for a row that has none.
 *
 * The column is `NOT NULL DEFAULT 0` in SQL and absent from a row the in-memory adapter was handed
 * without one. `Number(undefined)` is NaN, and every comparison against NaN is false, which sorts
 * such a row wherever the comparison happened to leave it rather than anywhere in particular.
 */
function storedPosition(value: unknown): number {
  const position = Number(value);
  return Number.isFinite(position) ? position : Number.MAX_SAFE_INTEGER;
}

function toPost(row: StoredRow): ContentPost {
  return {
    id: storedText(row.id),
    title: storedText(row.title),
    body: storedText(row.body),
    status: storedText(row.status),
    author_id: row.author_id === null || row.author_id === undefined ? null : storedText(row.author_id),
    position: storedPosition(row.position),
  };
}

/** The stored order, with the id as the tie-break so two rows at one position have a fixed order. */
function byPosition(left: ContentPost, right: ContentPost): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function toPosts(rows: unknown[]): ContentPost[] {
  return rows
    .filter((row): row is StoredRow => typeof row === "object" && row !== null)
    .map(toPost)
    .sort(byPosition);
}

/** The columns a person may write, each one absent unless it was sent. */
type ContentDraft = { title?: string; body?: string; status?: string };

/**
 * The three columns a person may write, checked against what the columns can hold.
 *
 * A title of only whitespace is refused rather than trimmed away to nothing, because the column
 * refuses it too and two stores answering differently about the same title is a demo that lies
 * about its own schema. A title that is sent with whitespace around it is stored trimmed, which is
 * the value the column's own test is written against.
 */
function draftOf(values: unknown): ContentDraft {
  const record = (values ?? {}) as StoredRow;
  const draft: ContentDraft = {};

  const title = writtenText(record.title);
  if (title !== undefined) {
    if (title.trim() === "") throw new Error("A post needs a title");
    draft.title = title.trim();
  }

  const body = writtenText(record.body);
  if (body !== undefined) draft.body = body;

  const status = writtenText(record.status);
  if (status !== undefined) {
    if (!isContentStatus(status)) throw new Error(`"${status}" is not a status a post can be in`);
    draft.status = status;
  }

  return draft;
}

export async function readContentPosts(): Promise<ContentPost[]> {
  return toPosts(await queryResourceAction(CONTENT_RESOURCE));
}

export async function readContentPost(id: string): Promise<ContentPost | null> {
  const row = await readResourceAction(CONTENT_RESOURCE, id);
  return row === null || row === undefined ? null : toPost(row as StoredRow);
}

/**
 * A new post, at the end of the list and in the column's default status.
 *
 * The position is asked for rather than left to the column default, because that default is 0 and a
 * new post at position 0 sorts above the seeded ones on one store while, with no position at all, it
 * sorts nowhere in particular on the other. One read to place it buys the two stores behaving the
 * same way. The status is spelled out for the same reason: `draft` is what the column default is, so
 * writing it is not a decision about the post, it is the value the other store would have stored.
 */
export async function createContentPost(values: unknown): Promise<ContentPost> {
  const existing = toPosts(await queryResourceAction(CONTENT_RESOURCE));
  const last = existing.length === 0 ? -1 : existing[existing.length - 1].position;
  const created = await createResourceAction(CONTENT_RESOURCE, {
    status: "draft",
    ...draftOf(values),
    position: last + 1,
  });
  return toPost(created as StoredRow);
}

export async function updateContentPost(id: string, values: unknown): Promise<ContentPost> {
  const updated = await updateResourceAction(CONTENT_RESOURCE, id, draftOf(values));
  return toPost(updated as StoredRow);
}

export async function deleteContentPost(id: string): Promise<void> {
  await deleteResourceAction(CONTENT_RESOURCE, id);
}
