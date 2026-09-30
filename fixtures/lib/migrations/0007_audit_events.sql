-- SPDX-License-Identifier: MIT
-- A trail of what the demo's writes did, so the package's audit seam has somewhere to write.
--
-- Shaped like 0005_post_revisions.sql beside it, and deliberately not exposed as a resource a browser
-- browses: this is a record of what happened, not a table the admin lists.
--
-- `fields` holds field NAMES. The package's event carries names for the same reason a trail must:
-- holding every value a record has ever had is a second copy of every secret in the table.
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  -- Empty for a write to a whole collection rather than a record.
  resource_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL DEFAULT '[]',
  occurred_at TEXT NOT NULL
);

-- The read a trail exists for: "what happened to this record", and "what happened to this resource".
CREATE INDEX IF NOT EXISTS audit_events_record_idx ON audit_events (resource, resource_id);
