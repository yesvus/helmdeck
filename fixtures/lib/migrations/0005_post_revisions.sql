-- SPDX-License-Identifier: MIT
--
-- What a post said before each change, so a person editing content can see it and put it back.
--
-- Its own table rather than a column or two on `posts`. History that shares a row with the thing it
-- describes is history that gets overwritten by the next save, which is the failure this table
-- exists to remove.
--
-- A revision holds the content as it was *before* the change it records, which is the direction a
-- person needs when they ask what it said before. It also means a restore is a write like any
-- other: the content a restore replaces is recorded first, so putting a version back is reversible
-- by restoring the version the restore replaced. The current content is never in here, because it
-- is the post row itself and copying it would be a second answer to a question the row already
-- answers.
--
-- `cause` is what makes the history readable. An edit, a publish, an unpublish and a restore all
-- change a post, but only one of them is a way back, and a list that cannot tell them apart is a
-- list of near-identical rows. `restored_from` names the version a restore put back.
--
-- `position` is an integer, unique per post, and is the order. Ordering by `created_at` alone would
-- tie: two saves in the same clock tick are two distinct changes, and a history that cannot say
-- which came first is not a history. The unique constraint is also what makes a double-submitted
-- form fail loudly instead of writing two rows into the same place in the order.
--
-- `actor_email` and `actor_role` are copied rather than joined. A session is a cookie that expires
-- and a user row that can be edited, and a history that reads through both can change its account
-- of the past after the fact. `actor_role` is plain text rather than a foreign key on purpose: the
-- roles a session may hold are the demo rule's business, not this table's, and a constraint here
-- would refuse to record a change by somebody the demo has not defined a role for yet.
--
-- Applied by `scripts/apply-migrations`, which is the only supported way to change this file.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS post_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  cause TEXT NOT NULL CHECK (cause IN ('edit', 'publish', 'unpublish', 'restore')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT '',
  restored_from TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (post_id, position)
);

CREATE INDEX IF NOT EXISTS post_revisions_post_idx ON post_revisions (post_id, position);
