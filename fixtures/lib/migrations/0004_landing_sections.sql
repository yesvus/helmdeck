-- SPDX-License-Identifier: MIT
--
-- The landing page's sections, as rows the collection editor can reorder.
--
-- Its own table rather than a column set on `dashboard_placements`, because that table already means
-- something else: `0001_initial.sql` declares it as the engine dashboard's arrangement, so a saved
-- dashboard is durable rather than a constant in a component. A landing page and an engine dashboard
-- are both ordered lists of things a person arranges, which is exactly why sharing one table would
-- have looked reasonable and then let the landing editor write the dashboard's arrangement. The
-- dashboard page still renders a constant today, so nothing reads those rows yet, which is the moment
-- to get this wrong rather than after it does.
--
-- `position` is an integer and unique per page, so the order is a column rather than an assumption
-- about insertion. Negative positions are legal and are what a reorder writes first: moving a row
-- onto a position another row still holds would fail the constraint halfway through a swap, so a
-- reorder parks everything out of the way and then puts it back.
--
-- `content` is a JSON document because a section's fields belong to the host, not to a schema here.
-- The editor's own fields are top-level columns, so the columns a query can rely on stay columns.
--
-- Applied by `scripts/apply-migrations`, which is the only supported way to change this file.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS landing_sections (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (length(trim(kind)) > 0),
  title TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (page, position)
);

CREATE INDEX IF NOT EXISTS landing_sections_page_idx ON landing_sections(page, position);
