-- SPDX-License-Identifier: MIT
--
-- A publish that happens later, as a row rather than as a column on `posts`.
--
-- `posts.status` is constrained to `draft` and `published` and nothing richer is modelled, which is
-- not a gap this file fills. A scheduled post is a draft until its moment and a published post
-- after it, exactly as a post somebody published by hand is, and the history needs to be able to
-- tell the two apart by what they have in common rather than by a third status. What a column on
-- `posts` would have no room for is who chose the moment, whether that moment has been reached, and
-- the fact that somebody called it off, so the schedule is a row and `posts` gains no column.
--
-- A row that says a post is scheduled and nothing acts on it is a column pretending to be a
-- feature, so `state` is written by the run that publishes: `pending` becomes `published` with the
-- time it happened in `settled_at`, or stays `pending` with `last_refusal` naming why it could not.
-- The run is the only thing that moves a row out of `pending`, which is what makes the page's "due"
-- a statement about work waiting rather than a decoration.
--
-- One pending row per post, by a partial unique index. Two of them would be a promise that cannot
-- be kept: the first to reach its moment publishes the post, and the second can never fire, because
-- `publishPost` refuses a post that is already published rather than writing a change into the
-- history that did not happen. A row stuck pending for ever is a lie a person acts on.
--
-- `publish_at` is an ISO 8601 instant in UTC, which is a form both stores compare: two text values
-- in a fixed zone order as the moments they name, where a local time means one thing to the machine
-- that wrote it and another to the one that read it.
--
-- `actor_email` and `actor_role` are copied rather than joined, for the reason `post_revisions`
-- copies them: the run happens later and has no session to resolve, so the row that chose the
-- moment is the row that says whose choice it was. The role is copied for the record only and is
-- not what the run decides by. The run reads the role off the `users` row when it fires, so an
-- account that no longer holds the power to update a post does not publish one on the strength of a
-- role it had when it set the moment.
--
-- `settled_at` is present exactly while the row is not pending, so a published or cancelled
-- schedule cannot also read as one still waiting. A deleted post takes its schedules with it: a
-- schedule with nothing to publish is a promise nobody can keep, and the foreign key is the honest
-- way to say so.
--
-- Applied by `scripts/apply-migrations`, which is the only supported way to change this file.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS post_schedules (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  publish_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'published', 'cancelled')),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  settled_at TEXT,
  last_refusal TEXT,
  CHECK ((state = 'pending') = (settled_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS post_schedules_pending_idx
  ON post_schedules (post_id) WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS post_schedules_due_idx
  ON post_schedules (state, publish_at);
