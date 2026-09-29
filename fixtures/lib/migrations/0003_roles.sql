-- SPDX-License-Identifier: MIT
--
-- The demo's two accounts, as rows.
--
-- A session's role is read from the user row its session row points at, so the two accounts that
-- decide what the whole demo can do are declared here as well as in the seed, and they are the same
-- ids: the seed's first run fills in the password hashes this file cannot know and leaves the roles
-- alone. An account whose role lives only in the seed is an account that does not exist until
-- something asks for it, which is a different thing from an account the demo publishes.
--
-- Inserted once and never overwritten. `INSERT OR IGNORE` keys on the primary key, so applying this
-- again cannot put an account back to the role named here.
--
-- The password column is NOT NULL and a migration has no hash to put in it, so it is left empty: no
-- login matches that, and a password hash carried in a migration file would be a password carried in
-- the repository.

INSERT OR IGNORE INTO users (id, email, password_hash, role) VALUES
  ('usr_owner', 'owner@demo.helmdeck.dev', '', 'admin'),
  ('usr_editor', 'editor@demo.helmdeck.dev', '', 'editor');
