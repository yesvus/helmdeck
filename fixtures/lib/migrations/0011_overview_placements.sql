-- SPDX-License-Identifier: MIT
--
-- Put the demo dashboard's tiles back to ones that can answer.
--
-- The overview was seeded with four placements: `signups`, `orders`, `revenue` and `notes`. Two of
-- those cannot work, and a third is the one people land on first.
--
-- `signups` asks `loadSignupCountAction`, which queries the accounts table on purpose, because the
-- admin does not expose it. That refusal is a demonstration of a widget failing visibly, and it was the
-- first tile on the public dashboard, so every visitor met a "Try again" button that could never work.
-- Measured on the deployed demo: the button was the first thing on the page and a click did nothing.
--
-- `orders` and `notes` have no loader at all. The grid says so rather than waiting for an answer that
-- cannot arrive, which is right, and it means half the dashboard was placeholders.
--
-- So the seed now names five widgets that all have loaders, and this migration brings a database that
-- was seeded before that into line. It replaces rows rather than editing them, because `UNIQUE
-- (dashboard, position)` holds while the new set goes in, and a delete-then-insert would briefly leave
-- the overview empty if the second statement failed.
--
-- The refusal demonstration is not lost. The `signups` widget and its loader are both still registered
-- and reachable from the arrange page, which is where a demonstration belongs: visible when asked for,
-- absent from the page everyone else sees.
INSERT OR REPLACE INTO dashboard_placements (id, dashboard, widget, size, position) VALUES
  ('plc_revenue', 'overview', 'revenue', 'md', 0),
  ('plc_catalog', 'overview', 'catalog', 'sm', 1),
  ('plc_reorder', 'overview', 'reorder', 'md', 2),
  ('plc_review', 'overview', 'reviewQueue', 'sm', 3),
  ('plc_average', 'overview', 'averageOrder', 'sm', 4);

DELETE FROM dashboard_placements
WHERE dashboard = 'overview'
  AND id NOT IN ('plc_revenue', 'plc_catalog', 'plc_reorder', 'plc_review', 'plc_average');