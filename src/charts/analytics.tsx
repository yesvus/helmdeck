// SPDX-License-Identifier: MIT
"use client";

import { AdminRankChart, type AdminRankItem } from "./rank.js";
import { AdminTimeSeriesChart } from "./time-series.js";
import type { AdminChartFormatters } from "./table.js";
import type { AdminAnalyticsPoint } from "../analytics/query.js";
import { useAdminMessages } from "../i18n.js";
import { defaultAdminAnalyticsChartMessages } from "./analytics-messages.js";

export type AdminVisitorTrendPoint = Pick<AdminAnalyticsPoint, "key" | "label" | "views" | "visitors">;

export type AdminDeviceBreakdownItem = {
  key: string;
  label: string;
  visits: number;
};

export function AdminVisitorTrendChart({
  points,
  formatters,
  ariaLabel,
  variant = "line",
  height,
  className,
}: {
  points: readonly AdminVisitorTrendPoint[];
  formatters: AdminChartFormatters;
  ariaLabel: string;
  variant?: "bar" | "line";
  height?: number;
  className?: string;
}) {
  const messages = { ...defaultAdminAnalyticsChartMessages, ...useAdminMessages().analyticsCharts };

  return (
    <AdminTimeSeriesChart
      ariaLabel={ariaLabel}
      categories={points}
      series={[
        { key: "views", label: messages.pageViews, values: points.map((point) => point.views) },
        { key: "visitors", label: messages.uniqueVisitors, values: points.map((point) => point.visitors) },
      ]}
      formatters={formatters}
      variant={variant}
      integerTicks
      height={height}
      className={className}
    />
  );
}

export function AdminDeviceBreakdownChart({
  items,
  formatters,
  ariaLabel,
  className,
}: {
  items: readonly AdminDeviceBreakdownItem[];
  formatters: AdminChartFormatters;
  ariaLabel: string;
  className?: string;
}) {
  const messages = { ...defaultAdminAnalyticsChartMessages, ...useAdminMessages().analyticsCharts };
  const rankItems: AdminRankItem[] = items.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.visits,
  }));

  return (
    <AdminRankChart
      ariaLabel={ariaLabel}
      items={rankItems}
      formatters={formatters}
      integerTicks
      valueLabel={messages.deviceVisits}
      className={className}
    />
  );
}
