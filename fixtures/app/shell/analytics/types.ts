// SPDX-License-Identifier: MIT

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
