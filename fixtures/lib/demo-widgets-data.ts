// SPDX-License-Identifier: MIT
"use server";

/**
 * The reads behind the six shipped tiles, over the boundary the resource pages already use.
 *
 * Every action here calls `queryResourceAction`, so this file is not a second way into the store: the
 * same session check, the same closed set of resources the admin exposes and the same permission rule
 * run per call. That is what keeps the role honest on this page rather than only on the resource
 * pages. An editor cannot read `orders`, so the revenue stat, the orders table and the revenue chart
 * are the boundary's refusal rendered as the engine's error state, and the products tiles render for
 * the same person because products are reachable by both roles.
 *
 * Cents stay integers through every total here and are divided by 100 in the widget's own formatter,
 * which is the only place the division happens. A total assembled from an already-formatted amount is
 * a different number from the one the ledger holds as soon as rounding is involved.
 *
 * The search term narrows the rows the store returned rather than being pushed into the query, because
 * this demo's persistence contract filters by column equality and has no substring operator. The rows
 * are still the store's, which is the property that matters: a term that matches nothing produces the
 * empty state from real data rather than from a constant written beside a tile.
 *
 * A `"use server"` module may only export async functions, so the shapes these answer with live in
 * `demo-widgets-types.ts`, which carries no directive and is erased before the bundle is built.
 */

import {
  adminAggregate,
  adminAggregateTotals,
  adminChartDayKey,
  adminChartDayRange,
  adminChartFillDays,
  adminWholeNumber,
} from "@yesvus/helmdeck";
import { queryResourceAction } from "./resource-actions";
import { listPostRevisions } from "./demo-revisions";
import { currentDemoSession } from "./demo-session";
import type {
  ActivityEvent,
  DailyRevenue,
  RankedProduct,
  TileOrder,
  TileProduct,
  WindowedMoney,
} from "./demo-widgets-types";

/** The fields these tiles read, which is not the whole row. */
type ProductRow = { id: string; name: string; sku: string; price_cents: number; stock: number };
type OrderRow = { id: string; total_cents: number; status: string; customer: string; created_at: string };

/**
 * The statuses where the money is in.
 *
 * Named rather than excluded, so a status nobody has thought about stays out of a total rather than
 * quietly joining one.
 */
const EARNED = new Set(["paid", "shipped"]);

const DAY_IN_MS = 86_400_000;

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The store's own guard, now the package's, so a tile here and a host's tile refuse the same column alike. */
const wholeNumber = (row: Record<string, unknown>, column: string) =>
  adminWholeNumber(row[column], column);

/** The two windows the stat tile colours itself from, split at a moment named by the caller. */
function earnedBefore(rows: readonly OrderRow[], splitAt: number): OrderRow[] {
  return rows.filter((order) => {
    const at = Date.parse(order.created_at ?? "");
    return Number.isFinite(at) && at < splitAt;
  });
}

/** Whether any of the texts a person would recognise carries the term, compared without regard to case. */
function matches(term: string, ...texts: unknown[]): boolean {
  if (term === "") return true;
  return texts.some((text) => String(text ?? "").toLowerCase().includes(term));
}

async function products(term: string): Promise<ProductRow[]> {
  const rows = (await queryResourceAction("products")) as ProductRow[];
  return rows.filter((row) => matches(term, row.name, row.sku));
}

async function orders(term: string): Promise<OrderRow[]> {
  const rows = (await queryResourceAction("orders")) as OrderRow[];
  return rows.filter((row) => matches(term, row.customer, row.status));
}

function earned(rows: readonly OrderRow[]): OrderRow[] {
  return rows.filter((order) => EARNED.has(order.status));
}

function sumCents(rows: readonly OrderRow[]): number {
  return adminAggregateTotals({
    rows,
    measures: { cents: (order) => wholeNumber(order, "total_cents") },
  }).cents;
}

/**
 * The same figure over two windows, so the stat tile has something to colour itself from.
 *
 * The earlier window is as long as the later one and ends where the later one begins, so the two are
 * the same measure of the same thing and the ratio between them means something. A store with nothing
 * in the earlier window answers zero there, which is a fact rather than a gap, and the tile prints the
 * figure without a trend rather than dividing by nothing.
 *
 * An order the store cannot date belongs to neither window. Filing it under the epoch would drop every
 * undated order into the older one and turn the trend into a statement about the parse, and the demo's
 * memory store has no column defaults, so an order there really does have no time.
 */
export async function loadWindowedRevenueAction(days: number, term: string): Promise<WindowedMoney> {
  const rows = earned(await orders(term));
  const splitAt = Date.now() - Math.max(0, Math.floor(days)) * DAY_IN_MS;

  const recent: OrderRow[] = [];
  for (const order of rows) {
    const at = Date.parse(order.created_at ?? "");
    if (Number.isFinite(at) && at >= splitAt) recent.push(order);
  }

  return {
    cents: sumCents(recent),
    previousCents: sumCents(earnedBefore(rows, splitAt)),
    orders: recent.length,
  };
}

/**
 * The orders table, largest first, capped to the rows a dashboard has space for.
 *
 * The cap is this file's rather than the widget's, because the widget owns how a cap is drawn and a
 * host owns which rows are worth drawing. A table of every order ever placed would be a different
 * page, and one nobody would keep open.
 */
export async function loadRecentOrdersAction(limit: number, term: string): Promise<TileOrder[]> {
  const rows = await orders(term);
  return rows
    .map((order) => ({
      id: String(order.id ?? ""),
      customer: String(order.customer ?? ""),
      status: String(order.status ?? ""),
      totalCents: wholeNumber(order, "total_cents"),
    }))
    .sort((left, right) => right.totalCents - left.totalCents || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit));
}

/**
 * The list tile's rows: the products holding the least stock, emptiest first.
 *
 * A list rather than a chart because the question is which of these to reorder, and the answer is a
 * handful of names a person acts on rather than bars they compare. The tie-break is the name so two
 * products on the same count do not swap places between loads.
 */
export async function loadLowStockAction(limit: number, term: string): Promise<TileProduct[]> {
  const rows = await products(term);
  return rows
    .map((product) => ({
      id: String(product.id ?? ""),
      name: String(product.name ?? ""),
      sku: String(product.sku ?? ""),
      priceCents: wholeNumber(product, "price_cents"),
      stock: wholeNumber(product, "stock"),
    }))
    .sort((left, right) => left.stock - right.stock || left.name.localeCompare(right.name))
    .slice(0, Math.max(0, limit));
}

/**
 * The ranked tile's rows: the catalog's retail value, largest first.
 *
 * Unit price times units held, in cents throughout. This ranks the same products the list tile does by
 * a different measure on purpose: the order is the claim, and two orderings of one catalog answer two
 * different questions.
 */
export async function loadStockValueRankAction(term: string): Promise<RankedProduct[]> {
  const rows = await products(term);
  return rows
    .map((product) => ({
      key: String(product.id ?? ""),
      label: String(product.name ?? ""),
      units: wholeNumber(product, "stock"),
      cents: wholeNumber(product, "price_cents") * wholeNumber(product, "stock"),
    }))
    .sort((left, right) => right.cents - left.cents || left.label.localeCompare(right.label));
}

/**
 * Revenue per day across the trailing range, and its total.
 *
 * `end` is an argument rather than a read of the clock, so the range the caller states and the rows it
 * filters are the same range, which is what makes the answer checkable. Every day in the range comes
 * back, zero included, so a day nothing was sold on reads as a zero rather than as a gap a chart
 * would draw a straight line across, and a range in which nothing was sold is a real range rather than
 * an empty one.
 */
export async function loadDailyRevenueAction(end: Date, days: number, term: string): Promise<DailyRevenue> {
  const dayKeys = adminChartDayRange(days, end);
  // Bounded at both ends of the stated range, because the total this answers with is the one the tile
  // reads aloud beside the drawing. A row dated after the last day of the range would be in that
  // sentence and not on the axis, which is a total the chart does not show. The package holds that,
  // and holds it for the zeros too: every day in the range comes back holding one.
  const revenue = adminAggregate({
    rows: earned(await orders(term)),
    range: dayKeys,
    key: (order) => adminChartDayKey(order.created_at),
    measures: { cents: (order) => wholeNumber(order, "total_cents") },
  });

  return {
    cents: revenue.totals.cents,
    days: adminChartFillDays(
      dayKeys,
      new Map(revenue.buckets.map((bucket) => [bucket.key, bucket.values.cents])),
      (key) => dayLabel.format(new Date(`${key}T00:00:00Z`)),
    ),
  };
}

/**
 * The activity tile's rows: what changed in the content, newest first.
 *
 * `post_revisions` is the demo's own record of a change, and it is the only table here that says what
 * happened rather than what a row currently holds: a cause, an actor and a moment. So the tile has a
 * real event to date and a real kind to colour, and a store where nobody has edited a post answers
 * with no rows and gets the empty state rather than a feed of events that never happened.
 *
 * Read through `listPostRevisions`, which asks the rule about the post rather than about this table,
 * so the permission that governs reading a post's history is the one that governs reading the post. The
 * session is resolved from the request here rather than taken from a caller, because a caller that
 * could name a session is how a revision would end up readable by one nobody resolved. A request with
 * no session is refused by that same check rather than redirected from inside a loader, so the tile
 * shows the refusal instead of the page vanishing.
 */
export async function loadContentActivityAction(limit: number, term: string): Promise<ActivityEvent[]> {
  const session = await currentDemoSession();
  const posts = (await queryResourceAction("posts")) as Array<{ id: string }>;

  const histories = await Promise.all(
    posts.map(async (post) => await listPostRevisions(session, String(post.id ?? ""))),
  );

  return histories
    .flatMap((revisions) =>
      revisions.map((revision) => ({
        id: String(revision.id ?? ""),
        message: `${String(revision.cause ?? "changed")} “${String(revision.title ?? "")}”`,
        actor: String(revision.actor_email ?? ""),
        at: String(revision.created_at ?? ""),
        kind: String(revision.cause ?? ""),
      })),
    )
    .filter((event) => matches(term, event.message, event.actor, event.kind))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, Math.max(0, limit));
}
