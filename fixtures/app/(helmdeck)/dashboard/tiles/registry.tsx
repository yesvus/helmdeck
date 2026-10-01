// SPDX-License-Identifier: MIT

/**
 * The six tiles the package ships, declared once for the demo to render.
 *
 * This is the half of the dashboard that has no `"use client"`, and it is a separate module from the
 * demo's own `registry.tsx` because that one holds six hand-written widgets other work depends on.
 * Two registries rather than one with twelve entries, because a tile this package ships and a tile
 * somebody wrote here are different claims and merging them would make the shipped six unfalsifiable:
 * a change to either would look like a change to both.
 *
 * The chart pair is the exception to server-safety. `adminChartWidget` and `adminRankWidget` are client
 * modules because the charts they draw are, so this module carries the directive for the two of them
 * and gives up the ability to be asked on the server. The route is a client route for the same reason,
 * which is why the session check stays in the segment layout above it.
 *
 * Every accessor here reads a column the action named. None of them reads the clock, and none of them
 * decides a state: a loader that is slow, empty or failed produces a state the engine resolves, and a
 * widget that claimed a state of its own would make the grid untestable.
 */

"use client";

import {
  adminActivityWidget,
  adminChartWidget,
  adminListWidget,
  adminRankWidget,
  adminStatWidget,
  adminTableWidget,
  createAdminWidgetRegistry,
  type AdminWidgetDefinition,
} from "@yesvus/helmdeck";
import type {
  ActivityEvent,
  DailyRevenue,
  RankedProduct,
  TileOrder,
  TileProduct,
  WindowedMoney,
} from "../../../../lib/demo-widgets-types";

/** How far back the stat tile's earlier window reaches, in days. Named once so both windows match. */
export const TILE_WINDOW_DAYS = 30;

/** How many days the revenue chart draws. */
export const TILE_CHART_DAYS = 30;

/** How many orders the table draws. The widget caps too; this is the host's own ceiling on top. */
export const TILE_TABLE_ROWS = 6;

/** How many products the list draws, and the fewest a capped tile's note is worth showing. */
export const TILE_LIST_ROWS = 6;

/** How many events the feed draws. */
export const TILE_FEED_ROWS = 8;

/**
 * The order statuses that are a problem rather than a sale, and the tone each one earns.
 *
 * A pending order is money nobody has paid for and a cancelled one never was, so both read as warning
 * rather than as a neutral fact. Mapping the kind to the tone here rather than in the row is what lets
 * the tile scan: a reader looking for the one that went wrong finds it by colour.
 */
const ORDER_TONES: Readonly<Record<string, "warning" | "neutral">> = {
  pending: "warning",
  cancelled: "warning",
  paid: "neutral",
  shipped: "neutral",
};

/** What a content change did, and the tone that change earns in a feed somebody scans. */
const ACTIVITY_TONES: Readonly<Record<string, "success" | "warning" | "info" | "neutral">> = {
  publish: "success",
  unpublish: "warning",
  edit: "info",
  restore: "neutral",
};

export const revenueStatWidget = adminStatWidget<WindowedMoney>({
  id: "revenueStat",
  title: "Revenue in the last 30 days",
  description: "Paid and shipped orders, compared with the 30 days before them.",
  // Money is read as whole cents, so the tile's own formatter is the only place the sum is divided.
  unit: "money",
  value: (data) => data.cents,
  previous: (data) => data.previousCents,
  // A rise in revenue is good news, so the tile's default direction is right and `invertTrend` is
  // deliberately not set. The option is here for a host whose metric falls when things are going well.
  comparison: "against the previous 30 days",
  detail: (data) => `across ${data.orders} paid and shipped ${data.orders === 1 ? "order" : "orders"}`,
  // Host words, because the engine's "Nothing to show" would be true and useless on a money tile.
  empty: {
    title: "No money in this window",
    body: "No paid or shipped order falls in the last 30 days. The figure is zero rather than empty, because zero is what the store holds.",
  },
});

export const recentOrdersTableWidget = adminTableWidget<TileOrder>({
  id: "ordersTable",
  title: "Largest orders",
  description: "The orders worth the most money, largest first.",
  rows: (data) => data,
  getKey: (order) => order.id,
  // Money is read as whole cents, so the tile's own formatter is the only place the sum is divided.
  unit: "money",
  columns: [
    // Every column reads through `value`, which is what prints it and what decides its alignment. The
    // two text columns answer strings, so the tile leaves them left-aligned and prints them as
    // written; the total answers a number, so the tile right-aligns and formats it. A column with
    // only a header prints nothing at all, which is the tile refusing to guess.
    { key: "customer", header: "Customer", value: (order) => order.customer },
    { key: "status", header: "Status", value: (order) => order.status },
    { key: "totalCents", header: "Total", value: (order) => order.totalCents, width: "7rem" },
  ],
  cap: { max: TILE_TABLE_ROWS },
  empty: {
    title: "No orders yet",
    body: "The orders table has no rows, so there is nothing to compare.",
  },
});

export const lowStockListWidget = adminListWidget<TileProduct>({
  id: "lowStockList",
  title: "Least stock on hand",
  description: "The catalog's emptiest shelves first.",
  rows: (data) => data,
  getKey: (product) => product.id,
  label: (product) => product.name,
  // The full text stays reachable in the row's own title, so a truncated name is still a name.
  note: (product) => product.sku,
  value: (product) => product.stock,
  unit: "count",
  // A product with nothing on the shelf is a different thing from one holding a few, and the tone is
  // the whole reason to scan a list of names rather than read them.
  tone: (product) => (product.stock === 0 ? "warning" : product.stock < 10 ? "info" : "neutral"),
  cap: { max: TILE_LIST_ROWS },
  empty: {
    title: "Nothing low on stock",
    body: "Every product in the catalog is holding ten units or more.",
  },
});

export const dailyRevenueChartWidget = adminChartWidget<DailyRevenue>({
  id: "revenueChart",
  title: "Revenue by day",
  description: "Paid and shipped orders, summed per day in integer cents.",
  categories: (data) => data.days,
  series: (data) => [{ key: "revenue", label: "Revenue", values: data.days.map((day) => day.value) }],
  unit: "money",
  variant: "bar",
  // Cents are whole numbers and the axis is money, so the ticks are whole dollars.
  integerTicks: true,
  // The sentence is the chart, read instead of drawn. It names the range and the total, which are the
  // two things the drawing alone does not say out loud.
  ariaLabel: (data) => `Revenue by day over ${data.days.length} days, totalling ${(data.cents / 100).toFixed(2)} dollars`,
  empty: {
    title: "No revenue in this range",
    body: "No paid or shipped order falls in the selected days. Widen the range, or mark an order paid.",
  },
});

export const stockValueRankWidget = adminRankWidget<RankedProduct[]>({
  id: "stockValueRank",
  title: "Retail value on the shelf",
  description: "Unit price times units held, largest first.",
  items: (data) =>
    data.map((product) => ({ key: product.key, label: product.label, value: product.cents })),
  valueLabel: "on the shelf",
  unit: "money",
  integerTicks: true,
  ariaLabel: () => "Retail value of stock by product",
  // Not a time series. These rows are ordered by a measure no axis could show, and plotting them as
  // one would be a category error rather than a chart.
  cap: { max: 6 },
  empty: {
    title: "Nothing in the catalog",
    body: "The products table has no rows, so there is no stock to rank.",
  },
});

export const contentActivityWidget = adminActivityWidget<ActivityEvent>({
  id: "contentActivity",
  title: "What changed in the content",
  description: "Every recorded edit to a post, newest first.",
  rows: (data) => data,
  getKey: (event) => event.id,
  message: (event) => event.message,
  actor: (event) => event.actor,
  at: (event) => event.at,
  tone: (event) => ACTIVITY_TONES[event.kind] ?? "neutral",
  // Eight events is where a feed stops being scannable. The tile says how many it left out, so a
  // person is never left believing they have read the whole history.
  cap: { max: TILE_FEED_ROWS },
  empty: {
    title: "Nothing changed yet",
    body: "No post has been edited, published or restored, so the history is empty rather than short.",
  },
});

/**
 * Every tile on this page, in the order the grid shows them.
 *
 * A list rather than an object keyed by id, because a host registering a fixed set does not have a key
 * for each one, and the registry keys by `definition.id` itself. The order here is the reading order
 * of the page: the two figures, then the money over time, then the tables of things.
 */
export const shippedTileRegistry = createAdminWidgetRegistry([
  revenueStatWidget,
  dailyRevenueChartWidget,
  recentOrdersTableWidget,
  lowStockListWidget,
  stockValueRankWidget,
  contentActivityWidget,
]);

/**
 * The order tones a consumer of a `TileOrder` needs, exported so the list and the table cannot answer
 * about the same status differently.
 */
export { ORDER_TONES as shippedOrderTones, ACTIVITY_TONES as shippedActivityTones };

/** The definitions by id, for a caller that has a placement and wants the widget behind it. */
export type ShippedTileId =
  | "revenueStat"
  | "revenueChart"
  | "ordersTable"
  | "lowStockList"
  | "stockValueRank"
  | "contentActivity";

/** The erased shape the grid reads, so a caller that mixes tile kinds has one type to hold. */
export type ShippedTileDefinition = AdminWidgetDefinition<unknown>;
