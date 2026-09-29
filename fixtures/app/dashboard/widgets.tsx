// SPDX-License-Identifier: MIT
"use client";

/**
 * The demo dashboard's widgets, their arrangement, and the loader each one runs.
 *
 * A client module because every loader here calls a server action, so a load function can only be
 * called from the browser. The page states what that means for the route, and the layout above it is
 * the half that still decides who gets here.
 *
 * The widgets are genuinely different shapes of answer: a count, a filtered list, a money total
 * derived from cents, one that is slow because its query is, and one the boundary refuses. None of
 * them reports a number the store does not hold.
 */

import {
  adminDashboardAddPlacement,
  createAdminWidgetRegistry,
  defineAdminWidget,
  type AdminDashboard,
  type AdminWidgetLoader,
} from "@yesvus/helmdeck";
import {
  loadAverageOrderValueAction,
  loadCatalogAction,
  loadPendingOrdersAction,
  loadReorderAction,
  loadRevenueAction,
  loadSignupCountAction,
} from "../../lib/dashboard-data";

export type SignupCount = { total: number };
export type CatalogTotals = { products: number; units: number };
export type ReorderRow = { name: string; sku: string; stock: number };
export type ReviewQueue = { pending: number };
/** Cents, never a formatted amount: the sum is an integer and only the display divides it. */
export type MoneyTotal = { cents: number; orders: number };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** A product holding fewer than this is on the reorder list, and the widget says which level it used. */
const REORDER_LEVEL = 10;

const big = "text-2xl font-semibold text-zinc-900";
const caption = "mt-1 text-xs text-zinc-500";

export const dashboardRegistry = createAdminWidgetRegistry({
  revenue: defineAdminWidget<MoneyTotal>({
    id: "revenue",
    title: "Revenue",
    sizes: ["lg", "xl"],
    isEmpty: (data) => data.orders === 0,
    render: (data) => (
      <>
        <p className={big}>{money.format(data.cents / 100)}</p>
        <p className={caption}>
          across {data.orders} paid and shipped {data.orders === 1 ? "order" : "orders"}
        </p>
      </>
    ),
  }),
  signups: defineAdminWidget<SignupCount>({
    id: "signups",
    title: "Signups this month",
    sizes: ["sm"],
    isEmpty: (data) => data.total === 0,
    render: (data) => <p className={big}>{data.total}</p>,
  }),
  catalog: defineAdminWidget<CatalogTotals>({
    id: "catalog",
    title: "Products in the catalog",
    sizes: ["sm"],
    isEmpty: (data) => data.products === 0,
    render: (data) => (
      <>
        <p className={big}>{data.products}</p>
        <p className={caption}>{data.units} units in stock</p>
      </>
    ),
  }),
  reorder: defineAdminWidget<ReorderRow[]>({
    id: "reorder",
    title: "Products to reorder",
    sizes: ["sm"],
    isEmpty: (rows) => rows.length === 0,
    render: (rows) => (
      <ul className="space-y-1 text-sm text-zinc-700">
        {rows.map((row) => (
          <li key={row.sku} className="flex justify-between gap-2">
            <span className="truncate">{row.name}</span>
            <span className="shrink-0 text-zinc-500">{row.stock} left</span>
          </li>
        ))}
        <li className="pt-1 text-xs text-zinc-500">Below {REORDER_LEVEL} in stock</li>
      </ul>
    ),
  }),
  reviewQueue: defineAdminWidget<ReviewQueue>({
    id: "reviewQueue",
    title: "Orders awaiting review",
    sizes: ["sm"],
    isEmpty: (data) => data.pending === 0,
    render: (data) => <p className={big}>{data.pending}</p>,
  }),
  averageOrder: defineAdminWidget<MoneyTotal>({
    id: "averageOrder",
    title: "Average order value",
    sizes: ["sm"],
    isEmpty: (data) => data.orders === 0,
    render: (data) => <p className={big}>{money.format(data.cents / 100)}</p>,
  }),
});

/**
 * The arrangement the demo ships. Read through `adminDashboardAddPlacement` rather than written out,
 * so each tile lands at a size its own widget declares support for and cannot be placed at one it
 * does not.
 */
export const demoDashboard: AdminDashboard = [
  "revenue",
  "signups",
  "catalog",
  "reorder",
  "reviewQueue",
  "averageOrder",
].reduce<AdminDashboard>(
  (current, widget) => adminDashboardAddPlacement(current, dashboardRegistry, widget),
  { name: "overview", placements: [] },
);

// Typed per widget, so a loader whose answer no longer matches what the widget renders fails to
// compile rather than rendering a field that is not there.
const revenueLoader: AdminWidgetLoader<MoneyTotal> = async () => loadRevenueAction();
const signupsLoader: AdminWidgetLoader<SignupCount> = async () => loadSignupCountAction();
const catalogLoader: AdminWidgetLoader<CatalogTotals> = async () => loadCatalogAction();
const reorderLoader: AdminWidgetLoader<ReorderRow[]> = async () => loadReorderAction(REORDER_LEVEL);
const reviewQueueLoader: AdminWidgetLoader<ReviewQueue> = async () => loadPendingOrdersAction();
const averageOrderLoader: AdminWidgetLoader<MoneyTotal> = async () => loadAverageOrderValueAction();

/**
 * One loader per placement, keyed the way the grid looks one up.
 *
 * The tiles are matched to their loaders by widget rather than by a hardcoded placement id, because
 * a placement's id is generated when it is added and a hand-written key would be a claim about
 * someone else's numbering. A loader that took an abort signal could not pass it on: the argument is
 * serialized to the server and a signal is not serializable, so a tile that gives up on a load stops
 * waiting for the answer rather than cancelling the query behind it. The client-side hook still
 * aborts its own requests, which is what keeps a tile from committing an answer it no longer wants.
 */
const loadersByWidget: Readonly<Record<string, AdminWidgetLoader<unknown>>> = {
  revenue: revenueLoader,
  signups: signupsLoader,
  catalog: catalogLoader,
  reorder: reorderLoader,
  reviewQueue: reviewQueueLoader,
  averageOrder: averageOrderLoader,
};

export const dashboardLoaders: Readonly<Record<string, AdminWidgetLoader<unknown>>> =
  Object.fromEntries(
    demoDashboard.placements
      .filter((placement) => loadersByWidget[placement.widget])
      .map((placement) => [placement.id, loadersByWidget[placement.widget]]),
  );
