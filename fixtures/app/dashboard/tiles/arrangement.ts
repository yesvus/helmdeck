// SPDX-License-Identifier: MIT

/**
 * The arrangement the shipped-tiles page places, built through the engine rather than written out.
 *
 * `adminDashboardAddPlacement` asks the registry for each tile's own smallest size, so a tile cannot
 * land at a width its definition never agreed to, and `adminDashboardSetSize` asks the registry again
 * before widening one. Both go through the same `validate` the grid uses, so an arrangement this module
 * builds cannot hold a placement the layout would report as unrenderable.
 *
 * The arrangement is code rather than rows in `dashboard_placements`, because that table holds the
 * demo's own six hand-written widgets and this page is a different set. Reading both arrangements from
 * one table would mean a saved row naming a widget the arranger's registry does not have, and the
 * engine would correctly report it as a tile it lost.
 *
 * The order is the reading order of the page: three narrow tiles that a reader scans, then the two
 * that are worth the full width. The feed sits with the narrow ones because a name and an age are
 * read; the orders table takes a row of its own because a money column is compared, not scanned.
 */

import {
  adminDashboardAddPlacement,
  adminDashboardSetSize,
  type AdminDashboard,
} from "@yesvus/helmdeck";
import { shippedTileRegistry } from "./registry";

/** The tiles as the grid shows them, and the two that are then widened to the full grid. */
const READING_ORDER = [
  "revenueStat",
  "lowStockList",
  "stockValueRank",
  "contentActivity",
  "revenueChart",
  "ordersTable",
] as const;

const FULL_WIDTH = ["revenueChart", "ordersTable"] as const;

/**
 * The dashboard this page renders.
 *
 * Built from the registry's own list rather than from a list of ids written beside it, so a tile the
 * registry stops registering is a tile the page stops placing. Naming them here instead would let the
 * two disagree, and the grid would render a tile nothing had a definition for.
 */
export function buildShippedTileDashboard(): AdminDashboard {
  const placed = shippedTileRegistry
    .list()
    .reduce<AdminDashboard>(
      (dashboard, definition) => adminDashboardAddPlacement(dashboard, shippedTileRegistry, definition.id),
      { name: "shipped-tiles", placements: [] },
    );

  // In the reading order rather than in registration order, so the grid reads the way the page means
  // it to. Keyed by widget so a tile that cannot be placed is absent from the order rather than
  // rendering a hole, and the layout reports the placement the engine could not build.
  const ordered = READING_ORDER.flatMap((widget) =>
    placed.placements.filter((placement) => placement.widget === widget),
  );
  const arranged: AdminDashboard = { ...placed, placements: ordered };

  return FULL_WIDTH.reduce((dashboard, widget) => {
    const at = dashboard.placements.findIndex((placement) => placement.widget === widget);
    return at === -1 ? dashboard : adminDashboardSetSize(dashboard, shippedTileRegistry, at, "xl");
  }, arranged);
}
