-- SPDX-License-Identifier: MIT
--
-- Something a visitor did, so the demo can count it.
--
-- One row per event, which is the shape the package's capture layer writes and its range read
-- expects. It grows faster than any other table here: a page view is a row per request, and an
-- admin's other tables grow with the work people do rather than with the traffic they cause.
--
-- `visitor_key` holds whatever key the host decided a visitor is, verbatim. This demo's host writes
-- a pseudonymous id it generates itself, and the column is nullable because a host that has decided
-- not to identify a visitor writes a view and no key, which the layer counts as a view and reports as
-- unattributed. Nothing derives the key: a column that filled itself in would be a fingerprinting
-- decision made by a migration rather than by the person who runs the site.
--
-- `occurred_at` is an ISO 8601 UTC instant rather than `datetime('now')`, because a range read
-- compares it as a string and `datetime('now')` yields a space and no zone, which a server in the
-- wrong zone files on the wrong day. The index is on it for the same reason: every read this table
-- serves is a range, and the retention prune is a range that moves.
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  visitor_key TEXT,
  source TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx ON analytics_events (occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_kind_idx ON analytics_events (kind);
