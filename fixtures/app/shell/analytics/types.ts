// SPDX-License-Identifier: MIT

export type DailyRevenue = {
  cents: number;
  days: Array<{ key: string; label: string; value: number }>;
};

export type RankedProduct = { key: string; label: string; units: number; cents: number };

export type RankedProducts = { products: RankedProduct[] };

export type AnalyticsTotals = {
  revenueCents: number;
  paidOrders: number;
  averageOrderCents: number;
  catalogValueCents: number;
  unitsInStock: number;
};
