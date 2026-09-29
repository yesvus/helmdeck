// SPDX-License-Identifier: MIT
"use client";

/**
 * The loader each widget runs, keyed by the widget rather than by a placement.
 *
 * A client module because every loader here calls a server action, so a load function can only be
 * called from the browser. The view states what that means for the route, and the layout above it is
 * the half that still decides who gets here.
 *
 * The arrangement is not named here. It arrives from the store as a resolved prop, so which tiles
 * exist, in what order and at what size is a fact about the rows rather than about this file.
 */

import type { AdminDashboardPlacement, AdminWidgetLoader } from "@yesvus/helmdeck";
import {
  loadAverageOrderValueAction,
  loadCatalogAction,
  loadPendingOrdersAction,
  loadReorderAction,
  loadRevenueAction,
  loadSignupCountAction,
} from "../../lib/dashboard-data";
import {
  REORDER_LEVEL,
  type CatalogTotals,
  type MoneyTotal,
  type ReorderRow,
  type ReviewQueue,
  type SignupCount,
} from "./registry";

// Typed per widget, so a loader whose answer no longer matches what the widget renders fails to
// compile rather than rendering a field that is not there.
const revenueLoader: AdminWidgetLoader<MoneyTotal> = async () => loadRevenueAction();
const signupsLoader: AdminWidgetLoader<SignupCount> = async () => loadSignupCountAction();
const catalogLoader: AdminWidgetLoader<CatalogTotals> = async () => loadCatalogAction();
const reorderLoader: AdminWidgetLoader<ReorderRow[]> = async () => loadReorderAction(REORDER_LEVEL);
const reviewQueueLoader: AdminWidgetLoader<ReviewQueue> = async () => loadPendingOrdersAction();
const averageOrderLoader: AdminWidgetLoader<MoneyTotal> = async () => loadAverageOrderValueAction();

/**
 * One loader per widget, matched to a placement by the widget it names.
 *
 * The tiles are matched to their loaders by widget rather than by a hardcoded placement id, because
 * a placement's id is whatever the store wrote for it and a hand-written key would be a claim about
 * someone else's rows. A placement naming a widget with no loader is left out, and the grid says so
 * rather than waiting for an answer that cannot arrive. A loader that took an abort signal could not
 * pass it on: the argument is serialized to the server and a signal is not serializable, so a tile
 * that gives up on a load stops waiting for the answer rather than cancelling the query behind it.
 * The client-side hook still aborts its own requests, which is what keeps a tile from committing an
 * answer it no longer wants.
 */
const loadersByWidget: Readonly<Record<string, AdminWidgetLoader<unknown>>> = {
  revenue: revenueLoader,
  signups: signupsLoader,
  catalog: catalogLoader,
  reorder: reorderLoader,
  reviewQueue: reviewQueueLoader,
  averageOrder: averageOrderLoader,
};

/** Each placement's loader, keyed the way the grid looks one up. */
export function dashboardLoadersFor(
  placements: readonly AdminDashboardPlacement[],
): Readonly<Record<string, AdminWidgetLoader<unknown>>> {
  return Object.fromEntries(
    placements
      .filter((placement) => loadersByWidget[placement.widget])
      .map((placement) => [placement.id, loadersByWidget[placement.widget]]),
  );
}
