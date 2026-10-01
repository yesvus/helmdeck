// SPDX-License-Identifier: MIT
"use server";

/**
 * The demo dashboard's reads, taken through the boundary the resource pages already use.
 *
 * Nothing here re-implements authorization. Every widget calls `queryResourceAction`, so a
 * dashboard is not a second way into the store: the same session check, the same fixed set of
 * resources this admin exposes, and the same permission rule for a read all run per call. That is
 * also what makes the signups tile honest. It asks for the accounts table, the boundary refuses, and
 * the refusal is the failure the tile shows, rather than a state written by hand because a failing
 * widget is worth seeing.
 *
 * The aggregates are computed here rather than in the database because the persistence contract's
 * query is a filter, not an aggregate, and adding one for a dashboard would put a SQL dialect in a
 * host. Cents are summed as integers and divided by 100 only where a widget formats them, so no
 * total is ever built out of a formatted string. The summing itself is the package's, so a tile on
 * this dashboard and a host's own tile reach the same figure by the same arithmetic.
 */

import { adminAggregateTotals, adminWholeNumber } from "@yesvus/helmdeck";
import { queryResourceAction } from "./resource-actions";

/** The fields the dashboard reads out of a row, which is not the whole row. */
type ProductRow = { id: string; name: string; sku: string; stock: number };
type OrderRow = { id: string; total_cents: number; status: string };

/** The store's own guard, now the package's, so a tile here and a host's tile refuse the same column alike. */
const wholeNumber = (row: Record<string, unknown>, column: string) => adminWholeNumber(row[column], column);

/** Money the store holds over a set of orders, in integer cents, through the package's own summing. */
function revenueOf(rows: readonly OrderRow[]): number {
  return adminAggregateTotals({
    rows,
    measures: { cents: (order) => wholeNumber(order, "total_cents") },
  }).cents;
}

/**
 * Money the store has taken, named rather than excluded.
 *
 * A pending order is money nobody has paid for yet and a cancelled one never was, so revenue is the
 * statuses where the money is in. Listing what counts is what keeps a new status out of a total by
 * accident, which is how a number on a dashboard starts disagreeing with the ledger.
 */
const EARNED = new Set(["paid", "shipped"]);

async function orders(): Promise<OrderRow[]> {
  return (await queryResourceAction("orders")) as OrderRow[];
}

export async function loadCatalogAction(): Promise<{ products: number; units: number }> {
  const products = (await queryResourceAction("products")) as ProductRow[];
  return {
    products: products.length,
    units: adminAggregateTotals({
      rows: products,
      measures: { stock: (product) => wholeNumber(product, "stock") },
    }).stock,
  };
}

/** The reorder level is the widget's rule and is passed in, so it is stated in the one place that shows it. */
export async function loadReorderAction(level: number): Promise<{ name: string; sku: string; stock: number }[]> {
  const products = (await queryResourceAction("products")) as ProductRow[];
  return products
    .filter((product) => wholeNumber(product, "stock") < level)
    .map((product) => ({ name: product.name, sku: product.sku, stock: wholeNumber(product, "stock") }))
    .sort((left, right) => left.stock - right.stock);
}

export async function loadPendingOrdersAction(): Promise<{ pending: number }> {
  // Asked of the store as a filter rather than counted over every row: filtering is what the
  // persistence contract offers, and re-deriving it here would be a second place where "pending" is
  // defined and a second place for the two to disagree.
  const pending = (await queryResourceAction("orders", { status: "pending" })) as OrderRow[];
  return { pending: pending.length };
}

export async function loadSignupCountAction(): Promise<{ total: number }> {
  // Deliberately unreachable. The accounts table is not one this admin exposes, so the boundary
  // refuses this call and the tile reports the refusal. A dashboard that could read it would be a
  // way around the rule the resource pages are held to.
  const users = (await queryResourceAction("users")) as { id: string }[];
  return { total: users.length };
}

export async function loadRevenueAction(): Promise<{ cents: number; orders: number }> {
  const earned = (await orders()).filter((order) => EARNED.has(order.status));
  return { cents: revenueOf(earned), orders: earned.length };
}

export async function loadAverageOrderValueAction(): Promise<{ cents: number; orders: number }> {
  // The wait this tile used to take is gone. It slept 2500ms on the server, deliberately, so the
  // loading state would be a slow answer rather than a costume. Measured against the deployed demo
  // that made every dashboard load pay for it: response times over nineteen requests came back at
  // p50 60ms, p90 838ms and a max of 4290ms, and the maximum was this line.
  //
  // A demonstration that costs every visitor two and a half seconds is indistinguishable from a slow
  // product, and the demo is the thing people judge the engine by. The loading state is still
  // demonstrable, on a host that chooses to be slow, which is where a slow answer belongs.
  const earned = (await orders()).filter((order) => EARNED.has(order.status));
  if (earned.length === 0) return { cents: 0, orders: 0 };

  // The total divided by the count once, in integer cents, so this is a rounded figure. Averaging two
  // totals that were each already divided is the arithmetic this avoids.
  return { cents: Math.round(revenueOf(earned) / earned.length), orders: earned.length };
}
