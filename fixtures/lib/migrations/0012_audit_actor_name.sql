-- SPDX-License-Identifier: MIT
-- The actor's name, because the activity trail's filter searches for it.
--
-- The trail was written with the email and the role and no name, which is enough to say who wrote
-- something and not enough to find them by: the filter a reader types into matches any part of who a
-- person is, so a demo that offered the field and stored no name would answer "nothing matches"
-- for a name that is plainly on screen beside every event.
ALTER TABLE audit_events ADD COLUMN actor_name TEXT NOT NULL DEFAULT '';