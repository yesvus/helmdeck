// SPDX-License-Identifier: MIT

/**
 * Turning store rows into chart points, as pure functions.
 *
 * Split from the server actions so the arithmetic can be checked against rows that were written
 * down, rather than only against a database that happens to agree. The one thing this file is careful
 * about is that a day with no rows is a zero rather than a missing point: a chart that skips a gap
 * draws a straight line across it and the reader concludes it is a trend.
 */

import { adminChartDayKey } from "@yesvus/helmdeck";

/** The fields the charts read out of a row, which is not the whole row. */
export type AnalyticsProductRow = { id: string; name: string; sku: string; stock: number; price_cents: number };
export type AnalyticsOrderRow = { id: string; total_cents: number; status: string; created_at: string };

export type RevenuePoint = { key: string; label: string; value: number };

export type RankedProduct = { key: string; label: string; units: number; cents: number };

export const EARNED_STATUSES: ReadonlySet<string> = new Set(["paid", "shipped"]);

/**
 * A column a total is built from, refused rather than coerced.
 *
 * The store holds integers, and a total computed from anything else is wrong in a way that reads
 * correctly on screen. Refusing puts it in the chart's error state, where the reason is visible.
 * A bigint is accepted because a driver configured to return 64-bit integers is still an integer.
 */
export function wholeNumber(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new Error(`${column} is not a whole number: ${JSON.stringify(value)}`);
}

export function earnedOrders(rows: readonly AnalyticsOrderRow[]): AnalyticsOrderRow[] {
  return rows.filter((order) => EARNED_STATUSES.has(order.status));
}

/**
 * Cents per day, summed as integers.
 *
 * A row whose `created_at` is not a timestamp is dropped rather than filed under a guessed day: it
 * would otherwise land in a bucket that never appears on the axis, which is a total that does not
 * add up on screen. `from` bounds the range at the start only. A row dated after the last day is
 * only reachable when the caller asks for a range ending in the future, and excluding it would be a
 * rule with no failure it could cause.
 */
export function revenueByDay(
  rows: readonly AnalyticsOrderRow[],
  from?: string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const order of rows) {
    const day = adminChartDayKey(order.created_at ?? "");
    if (!day || (from !== undefined && day < from)) continue;
    totals.set(day, (totals.get(day) ?? 0) + wholeNumber(order, "total_cents"));
  }
  return totals;
}

export function sumCents(rows: readonly AnalyticsOrderRow[]): number {
  return rows.reduce((total, order) => total + wholeNumber(order, "total_cents"), 0);
}

/** The retail value of what is on the shelves: unit price times units held, in cents throughout. */
export function catalogValueCents(rows: readonly AnalyticsProductRow[]): number {
  return rows.reduce(
    (total, product) => total + wholeNumber(product, "price_cents") * wholeNumber(product, "stock"),
    0,
  );
}

/**
 * Products by units held.
 *
 * Sorted on the ranked measure and then on the name, so two products with the same stock do not
 * swap places between loads and the chart does not appear to shuffle on its own.
 */
export function rankByStock(rows: readonly AnalyticsProductRow[], limit: number): RankedProduct[] {
  return rows
    .map((product) => ({
      key: product.id,
      label: product.name,
      units: wholeNumber(product, "stock"),
      cents: wholeNumber(product, "price_cents"),
    }))
    .sort((left, right) => right.units - left.units || left.label.localeCompare(right.label))
    .slice(0, Math.max(0, limit));
}
