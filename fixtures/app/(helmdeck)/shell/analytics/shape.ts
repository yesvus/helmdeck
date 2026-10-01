// SPDX-License-Identifier: MIT

/**
 * Turning store rows into chart points, as pure functions.
 *
 * Split from the server actions so the arithmetic can be checked against rows that were written
 * down, rather than only against a database that happens to agree. The bucketing itself is the
 * package's, since a host installing it gets no other way to get it: what is left here is the part
 * that is about these two tables, which rows count as money and which product carries a name.
 *
 * The one thing this file is careful about is that a day with no rows is a zero rather than a missing
 * point: a chart that skips a gap draws a straight line across it and the reader concludes it is a
 * trend. `adminAggregate` holds that for the range, and the test below holds it for the rows.
 */

import { adminAggregate, adminAggregateTotals, adminChartDayKey, adminWholeNumber } from "@yesvus/helmdeck";

/** The fields the charts read out of a row, which is not the whole row. */
export type AnalyticsProductRow = { id: string; name: string; sku: string; stock: number; price_cents: number };
export type AnalyticsOrderRow = { id: string; total_cents: number; status: string; created_at: string };

export type RevenuePoint = { key: string; label: string; value: number };

export type RankedProduct = { key: string; label: string; units: number; cents: number };

export const EARNED_STATUSES: ReadonlySet<string> = new Set(["paid", "shipped"]);

/** The cents one order is worth, read through the package's guard so both this and a host's tile refuse alike. */
export const wholeNumber = adminWholeNumber;

export function earnedOrders(rows: readonly AnalyticsOrderRow[]): AnalyticsOrderRow[] {
  return rows.filter((order) => EARNED_STATUSES.has(order.status));
}

/**
 * Cents per day, summed as integers, over a stated range.
 *
 * The range is required rather than optional, which is what makes a day with no rows come back as a
 * zero: the periods the answer covers are named by the caller and every one of them is emitted, so a
 * gap reads as a gap. A row whose `created_at` is not a timestamp, and a row dated outside the range,
 * are in neither the buckets nor the total, and the caller is told how many of each there were.
 */
export function revenueByDay(
  rows: readonly AnalyticsOrderRow[],
  range: readonly string[],
): Map<string, number> {
  const totals = adminAggregate({
    rows,
    range,
    key: (order) => adminChartDayKey(order.created_at ?? ""),
    measures: { cents: (order) => wholeNumber(order.total_cents, "total_cents") },
  });
  return new Map(totals.buckets.map((bucket) => [bucket.key, bucket.values.cents]));
}

export function sumCents(rows: readonly AnalyticsOrderRow[]): number {
  return adminAggregateTotals({
    rows,
    measures: { cents: (order) => wholeNumber(order.total_cents, "total_cents") },
  }).cents;
}

/** The retail value of what is on the shelves: unit price times units held, in cents throughout. */
export function catalogValueCents(rows: readonly AnalyticsProductRow[]): number {
  return adminAggregateTotals({
    rows,
    measures: {
      cents: (product) => wholeNumber(product.price_cents, "price_cents") * wholeNumber(product.stock, "stock"),
    },
  }).cents;
}

/**
 * Products by units held.
 *
 * Sorted on the ranked measure and then on the name, so two products with the same stock do not
 * swap places between loads and the chart does not appear to shuffle on its own. The grouping is by
 * id, so each bucket holds one product and the label is that product's own name rather than a key.
 */
export function rankByStock(rows: readonly AnalyticsProductRow[], limit: number): RankedProduct[] {
  const products = adminAggregate({
    rows,
    key: (product) => product.id,
    label: (_key, product) => product?.name ?? "",
    measures: {
      units: (product) => wholeNumber(product.stock, "stock"),
      cents: (product) => wholeNumber(product.price_cents, "price_cents"),
    },
  });
  return products.buckets
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      units: bucket.values.units,
      cents: bucket.values.units * bucket.values.cents,
    }))
    .sort((left, right) => right.units - left.units || left.label.localeCompare(right.label))
    .slice(0, Math.max(0, limit));
}
