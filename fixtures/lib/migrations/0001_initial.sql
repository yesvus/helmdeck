-- SPDX-License-Identifier: MIT
--
-- The demo's schema.
--
-- Constraints live in the database rather than only in the adapter, because an adapter can be
-- bypassed by a hand-edited request and a constraint the database does not enforce is a comment.
-- Foreign keys are off by default in SQLite, so they are switched on per connection: a schema that
-- declares them and never enables them enforces nothing.
--
-- Applied by `scripts/apply-migrations`, which is the only supported way to change this file.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- `scrypt$<salt>$<key>`. The parameters travel with the hash so they can be raised later without
  -- invalidating existing rows.
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS posts_position_idx ON posts (position);
CREATE INDEX IF NOT EXISTS posts_status_idx ON posts (status);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sku TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  -- A total the engine cannot backdate and cannot silently re-derive wrongly.
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  customer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

-- The dashboard arrangement from the engine, so a saved dashboard is durable rather than a demo
-- constant. A placement references a widget by id, and a widget this build no longer registers is a
-- row the layout reports rather than one it drops.
CREATE TABLE IF NOT EXISTS dashboard_placements (
  id TEXT PRIMARY KEY,
  dashboard TEXT NOT NULL,
  widget TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('sm', 'md', 'lg', 'xl')),
  position INTEGER NOT NULL,
  UNIQUE (dashboard, position)
);

CREATE INDEX IF NOT EXISTS placements_dashboard_idx ON dashboard_placements (dashboard, position);
