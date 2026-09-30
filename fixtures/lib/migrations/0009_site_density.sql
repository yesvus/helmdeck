-- SPDX-License-Identifier: MIT
--
-- Density joins the site's own settings as a fourth column, because it is one of the two theme
-- settings `ADMIN_THEME_SETTING_KEYS` declares and it has to survive a reload the way the accent
-- does. A separate table or a JSON blob would have made density the one setting a person had to
-- set somewhere else, which is the split this demo was built to remove.
--
-- A column with a default rather than a rebuild, so a database migrated a release ago keeps its row:
-- every settings row that already exists reads `comfortable`, which is what the density token
-- declared before density was a setting, so an upgraded site renders what it rendered before.
--
-- The CHECK is the package's `ADMIN_DENSITIES` written in SQL, on the same terms as the accent and
-- support_email rules above: the application checks what a person can type and the database refuses
-- whatever gets past it, which is what makes the rule a rule rather than a courtesy.

ALTER TABLE site_settings
  ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable'
  CHECK (density IN ('compact', 'comfortable', 'spacious'));
