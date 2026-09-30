// SPDX-License-Identifier: MIT
"use server";

/**
 * The analytics reads, over the boundary the resource pages and the dashboard already use.
 *
 * Nothing here re-implements authorization. Every chart calls `queryResourceAction`, so this page
 * is not a second way into the store: the same session check, the same fixed set of resources the
 * admin exposes, and the same permission rule for a read all run per call. That is also what keeps
 * the editor role honest. It cannot reach `orders`, so the revenue chart for an editor is the
 * boundary's refusal rendered as an error state, rather than a number somebody decided was safe to
 * show. Products are reachable by both roles, so the stock chart renders for an editor while the
 * revenue chart does not, and the two are separate loads so one failing does not blank the page.
 *
 * The arithmetic lives in `shape.ts` and not here, so it can be checked against rows written down by
 * hand rather than only against a database that already agrees. Cents stay integers through all of
 * it and are divided by 100 in the chart's formatter alone.
 *
 * Every export of this file is an async function, because that is the whole of what a `"use server"`
 * module is allowed to export. The types these actions answer with live in `types.ts`, which carries
 * no directive and is erased before the bundle is built, so a client module can name the shape it
 * expects without pulling a server module across the boundary for it. The range default is private
 * for the same reason. Both are build failures rather than type errors, which is why a test and
 * `tsc` both pass while the production build does not.
 */

import { adminChartDayRange, adminChartFillDays } from "@yesvus/helmdeck";
import { queryResourceAction } from "../../../lib/resource-actions";
import type { AnalyticsTotals } from "./types";
import {
  catalogValueCents,
  earnedOrders,
  rankByStock,
  revenueByDay,
  sumCents,
  wholeNumber,
  type AnalyticsOrderRow,
  type AnalyticsProductRow,
  type RankedProduct,
} from "./shape";

/**
 * How many days this action covers when the caller does not say.
 *
 * Not exported. A `"use server"` module may only export async functions, so a constant exported from
 * here is a build failure that neither a test nor `tsc` reports. The page states its own range
 * through the control above it and passes the width in on every call, so nothing outside this file
 * needs the default and there is nothing for it to live in but here.
 */
const DEFAULT_RANGE_DAYS = 30;

/** Products on the ranked chart. The demo has five, so the cap is about what a longer catalog needs. */
const RANKED_PRODUCTS = 6;

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function formatDayLabel(dayKey: string): string {
  return dayLabel.format(new Date(`${dayKey}T00:00:00Z`));
}

async function readOrders(): Promise<AnalyticsOrderRow[]> {
  return (await queryResourceAction("orders")) as AnalyticsOrderRow[];
}

/**
 * Revenue per day across the trailing range, and its total.
 *
 * `end` is an argument rather than a read of the clock so the range the caller states and the rows
 * it filters are the same range, which is what makes the result checkable. Every day in the range
 * comes back, zero included, so the chart's empty state is reached by the data being empty rather
 * than written by hand.
 */
export async function loadDailyRevenueAction(
  end: Date = new Date(),
  days: number = DEFAULT_RANGE_DAYS,
): Promise<{ cents: number; days: Array<{ key: string; label: string; value: number }> }> {
  const dayKeys = adminChartDayRange(days, end);

  // Both ends of the range are given to the bucketing, not just the first, so a row dated after the
  // last day is in neither the points nor the total the tile reads aloud beside them.
  const totals = revenueByDay(earnedOrders(await readOrders()), dayKeys);

  return {
    cents: [...totals.values()].reduce((total, value) => total + value, 0),
    days: adminChartFillDays(dayKeys, totals, formatDayLabel),
  };
}

export async function loadStockByProductAction(): Promise<RankedProduct[]> {
  return rankByStock((await queryResourceAction("products")) as AnalyticsProductRow[], RANKED_PRODUCTS);
}

/**
 * The stat cards' numbers, from the same two tables the charts read.
 *
 * The average is the total divided by the count once, in integer cents, so it is a rounded figure.
 * Averaging two totals that were each already divided is the arithmetic this avoids, and it is the
 * reason a derived figure here is computed from the same integers the chart scales.
 */
export async function loadAnalyticsTotalsAction(): Promise<AnalyticsTotals> {
  const [earned, products] = await Promise.all([
    readOrders().then(earnedOrders),
    queryResourceAction("products") as Promise<AnalyticsProductRow[]>,
  ]);

  const revenueCents = sumCents(earned);
  return {
    revenueCents,
    paidOrders: earned.length,
    averageOrderCents: earned.length === 0 ? 0 : Math.round(revenueCents / earned.length),
    catalogValueCents: catalogValueCents(products),
    unitsInStock: products.reduce((total, product) => total + wholeNumber(product, "stock"), 0),
  };
}
