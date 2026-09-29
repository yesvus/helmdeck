-- SPDX-License-Identifier: MIT
--
-- The site's own settings, as a single row.
--
-- One row rather than a key/value table, because a settings screen has a fixed set of fields and a
-- key/value table turns every read into a scan and every rule into a string comparison in
-- application code. The id is fixed by a CHECK, so a second settings row is refused by the database
-- rather than by a convention one of the two writers remembers.
--
-- The rules are here as well as in `demo-settings.ts`, which is what makes them a rule rather than
-- a courtesy: the action can be bypassed by a hand-built request, and a constraint the database
-- does not enforce is a comment. A direct write of `#B45309` is refused, because the application
-- normalises an accent to lower case before storing it and a stored value the application would
-- have to re-parse is a value the shell has to defend against.
--
-- Seeded here rather than from the seed, for the same reason `0003_roles.sql` inserts the accounts:
-- a database migrated but not yet seeded still has a site, which is what a demo somebody visits
-- first thing after a deploy should find. `INSERT OR IGNORE` keys on the primary key, so applying
-- this again cannot put back a name somebody has since changed.

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY CHECK (id = 'site'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 48),
  accent TEXT NOT NULL CHECK (accent GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  support_email TEXT NOT NULL
    CHECK (support_email NOT LIKE '% %' AND support_email LIKE '%_@_%._%' AND length(support_email) <= 254),
  -- Who changed it and when, so the page can say whether the values on screen are ones a person put
  -- there or the ones the site started with.
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

INSERT OR IGNORE INTO site_settings (id, name, accent, support_email) VALUES
  ('site', 'Northstar Supply', '#b45309', 'support@northstar.example');
