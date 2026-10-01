// SPDX-License-Identifier: MIT

/**
 * What a post is, apart from how it looks.
 *
 * The status domain lives here rather than in the definition beside it, because two callers have to
 * agree about it and one of them is a server action that must not pull a view tree in behind it: the
 * form offers the statuses below, and the action refuses anything that is not one of them.
 *
 * This is the column's own domain rather than a host's preference. `0001_initial.sql` is where it is
 * enforced, and the CHECK constraint there refuses anything else, which is a stronger answer than any
 * list a fixture keeps. The action asks this list too, because the in-memory store the demo falls back
 * to when no database is configured has no constraint to ask, and a demo that stored a status its own
 * schema forbids would be showing a value the database would not accept.
 */

/** The table the content pages read and write, named once because four modules answer about it. */
export const CONTENT_RESOURCE = "posts";

export const CONTENT_STATUSES = ["draft", "published"] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value);
}
