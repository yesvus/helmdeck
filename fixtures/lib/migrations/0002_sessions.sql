-- SPDX-License-Identifier: MIT
--
-- Sessions for the demo's real login.
--
-- A session is a row rather than a self-contained cookie, which is what makes logout real: clearing
-- a cookie without deleting the row leaves a valid credential in someone's browser until it expires.
-- The cookie carries the id; the row is the authority on whether that id still means anything.
--
-- An expiry column rather than a TTL alone, so a session can be ended early and so a query for
-- "what is currently valid" is one comparison rather than a scan.

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Seconds since the epoch. Compared against now() by the store, so a session that expired an hour
  -- ago is invalid the moment it is looked at rather than when someone notices.
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);
