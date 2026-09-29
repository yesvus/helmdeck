// SPDX-License-Identifier: MIT

/**
 * The shapes the analytics actions answer with, named in one place.
 *
 * No directive on this module, deliberately. A `"use server"` module may only export async functions,
 * and a client component that needs one of these shapes would then have to import the action module
 * to name it, which pulls a server reference into the browser for a type. Types are erased at build
 * time, so this file costs the client bundle nothing while keeping the boundary to the three actions
 * in `data.ts` and nothing else.
 */

export type DailyRevenue = {
  cents: number;
  days: Array<{ key: string; label: string; value: number }>;
};

export type RankedProduct = { key: string; label: string; units: number; cents: number };

/** What the stock chart loads: the ranked rows themselves, so the chart maps over them directly. */
export type RankedProducts = RankedProduct[];

export type AnalyticsTotals = {
  revenueCents: number;
  paidOrders: number;
  averageOrderCents: number;
  catalogValueCents: number;
  unitsInStock: number;
};
