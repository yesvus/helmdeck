// SPDX-License-Identifier: MIT
"use client";

/**
 * The demo's analytics page: a chart of money and a chart of stock, both read from the store.
 *
 * A client component, and the reason is the data rather than the drawing. Every number here arrives
 * through a server action, because the store's connection is configured from environment variables
 * that must never reach a browser bundle. The engine's per-load hook owns the loading, failed, empty
 * and ready states, so what a reader sees on this page is the engine's answer and not this page's
 * impression of it. A chart with hardcoded numbers in it would look the same and answer nothing,
 * which is the whole reason the numbers arrive at all.
 *
 * The rule is still the one rule. `orders` is administrator-only, so for an editor the revenue chart
 * shows the boundary's refusal as its error state and the stock chart renders normally, rather than
 * this page deciding on its own what an editor may see.
 */

import { useState } from "react";
import {
  AdminChartFrame,
  AdminRankChart,
  AdminTimeSeriesChart,
  AdminStatCard,
  adminChartFormatters,
  adminFormatCents,
  type AdminChartFrameLabels,
  type AdminWidgetState,
} from "@yesvus/helmdeck";
import { BarChart3, Boxes, Receipt, Wallet, type LucideIcon } from "lucide-react";
import { useAnalyticsTotals, useDailyRevenue, useStockByProduct } from "./hooks";

const money = adminChartFormatters("money");
const counts = adminChartFormatters("count");

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/**
 * A chart in the engine's four states.
 *
 * `state.status` is handed straight through, so loading, empty, failed and ready are the engine's
 * answers and this page has no way to disagree with them. The retry is the load hook's own
 * `refetch`, which is what makes the button in the error state do the thing it says.
 */
function Chart<TData>({
  state,
  onRetry,
  icon,
  title,
  description,
  children,
  labels,
}: {
  state: AdminWidgetState<TData>;
  onRetry: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  labels?: Partial<AdminChartFrameLabels>;
}) {
  return (
    <AdminChartFrame
      icon={icon}
      title={title}
      description={description}
      status={state.status}
      error={state.status === "error" ? state.error : undefined}
      onRetry={onRetry}
      labels={labels}
    >
      {children}
    </AdminChartFrame>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const revenue = useDailyRevenue(range);
  const stock = useStockByProduct();
  const totals = useAnalyticsTotals();

  const ready = revenue.state.status === "ready" ? revenue.state.data : null;
  const readyStock = stock.state.status === "ready" ? stock.state.data : null;
  const readyTotals = totals.state.status === "ready" ? totals.state.data : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500">
            Sales and stock, read from the orders and products tables through the same server action
            the resource pages use.
          </p>
        </div>
        <label className="text-sm font-medium text-zinc-700">
          Date range
          <select
            aria-label="Date range"
            value={range}
            onChange={(event) => setRange(Number(event.target.value))}
            className="ml-2 rounded-admin-control border border-zinc-300 bg-admin-surface px-3 py-2"
          >
            {RANGES.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Revenue",
            icon: Wallet,
            value: readyTotals ? adminFormatCents(readyTotals.revenueCents) : null,
            detail: "Summed from the integer cents of every paid and shipped order.",
          },
          {
            label: "Average order value",
            icon: Receipt,
            value: readyTotals ? adminFormatCents(readyTotals.averageOrderCents) : null,
            detail: "The revenue total divided by the order count once, then rounded to a cent.",
          },
          {
            label: "Catalog value",
            icon: Boxes,
            value: readyTotals ? adminFormatCents(readyTotals.catalogValueCents) : null,
            detail: "Unit price times units held, over the products table, in cents.",
          },
          {
            label: "Units in stock",
            icon: BarChart3,
            value: readyTotals ? readyTotals.unitsInStock.toLocaleString("en-US") : null,
            detail: "The sum of the stock column, which is a count and not an amount.",
          },
        ].map((card) => (
          <AdminStatCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value ?? " "}
            detail={card.detail}
          />
        ))}
      </section>

      <Chart
        state={revenue.state}
        onRetry={revenue.refetch}
        icon={Wallet}
        title="Revenue by day"
        description="Paid and shipped orders, summed per day in integer cents. A day with no orders is a zero, not a gap."
        labels={{ emptyTitle: "No revenue in this range", emptyBody: "No paid or shipped order falls in the selected days. Widen the range, or place an order and mark it paid." }}
      >
        {ready ? (
          <AdminTimeSeriesChart
            ariaLabel={`Revenue by day over ${ready.days.length} days, totalling ${adminFormatCents(ready.cents)}`}
            categories={ready.days}
            series={[{ key: "revenue", label: "Revenue", values: ready.days.map((day) => day.value) }]}
            formatters={money}
            integerTicks
          />
        ) : null}
      </Chart>

      <Chart
        state={stock.state}
        onRetry={stock.refetch}
        icon={Boxes}
        title="Units in stock by product"
        description="The stock column of the products table, largest first. Each row's value is printed beside its bar, so the bar can be checked against the axis."
        labels={{ emptyTitle: "Nothing in the catalog", emptyBody: "The products table has no rows, so there is no stock to rank." }}
      >
        {readyStock ? (
          <AdminRankChart
            ariaLabel="Units in stock by product"
            items={readyStock.products.map((product) => ({
              key: product.key,
              label: product.label,
              value: product.units,
            }))}
            formatters={counts}
            valueLabel="units"
            integerTicks
          />
        ) : null}
      </Chart>
    </div>
  );
}
