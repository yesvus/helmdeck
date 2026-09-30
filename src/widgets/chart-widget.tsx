// SPDX-License-Identifier: MIT
"use client";

/**
 * A chart tile: the package's own chart, the engine's four states around it, and a host's rows
 * turned into the points it plots.
 *
 * The judgement is the mapping. A host that plots a chart writes the same five things every time:
 * which rows are the categories, which column is the value, what the axis says, whether the ticks
 * are whole numbers, and the sentence a screen reader gets instead of the drawing. Each of those has
 * a right answer that is easy to get wrong, and getting the last one wrong is invisible on screen
 * and fatal off it. Here they are four options and the widget decides the formatters, the empty rule
 * and the caption.
 *
 * Emptiness is the absence of points, not the absence of height. A range where every day is a zero
 * is a real week that happened, and drawing it flat says so; a widget that read "all values are
 * zero" as empty would hide the one period worth asking about.
 *
 * Client-side, because the chart is. The time series answers a hover from local state, and a tile
 * that has to be a client component to draw is a tile the dashboard already had to make one.
 */

import { AdminRankChart, type AdminRankItem } from "../charts/rank.js";
import type { AdminChartCategory, AdminChartSeries } from "../charts/series-types.js";
import { adminChartFormatters, type AdminChartUnit } from "../charts/table.js";
import { AdminTimeSeriesChart } from "../charts/time-series.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { defineAdminWidget } from "./registry.js";
import {
  adminWidgetCappedRows,
  adminWidgetRequired,
  type AdminWidgetCap,
  type AdminWidgetEmptyCopy,
} from "./values.js";
import { defaultAdminShippedWidgetLabels, type AdminShippedWidgetLabels } from "./labels.js";
import type { AdminWidgetDefinition, AdminWidgetSize } from "./types.js";

export type AdminChartWidgetOptions<TData> = {
  id: string;
  title: string;
  description?: string;
  /**
   * The chart's points on the horizontal axis, each a key and a label. A host hands over the rows
   * it already has rather than re-keying them into a shape the chart agreed to once.
   */
  categories: (data: TData) => readonly AdminChartCategory[] | null | undefined;
  /**
   * The values, one per category and in category order. A short array is read as a zero for what is
   * missing, which is what the chart itself does, so the two cannot disagree about a gap.
   */
  series: (data: TData) => readonly AdminChartSeries[] | null | undefined;
  variant?: "bar" | "line";
  /**
   * What the values are measured in, which picks the formatters. Both units the package ships are
   * whole numbers, so the axis ticks are integers unless a host says otherwise; a rate is the case
   * that needs the override.
   */
  unit?: AdminChartUnit;
  integerTicks?: boolean;
  height?: number;
  /** The sentence a screen reader reads instead of the drawing. The widget's title is used when absent. */
  ariaLabel?: (data: TData) => string;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

export type AdminRankWidgetOptions<TData> = {
  id: string;
  title: string;
  description?: string;
  /** The ranked things: a key, a label and a value, largest first if the host sorted them. */
  items: (data: TData) => readonly AdminRankItem[] | null | undefined;
  /** The unit printed after each value, so a bare number is not left to be interpreted. */
  valueLabel?: string;
  unit?: AdminChartUnit;
  integerTicks?: boolean;
  /**
   * How many rows are drawn. A ranking of two hundred products says nothing in a tile, and the note
   * under it is what keeps the cut list from reading as the whole one.
   */
  cap?: AdminWidgetCap;
  /** The sentence under a capped ranking, for a host whose interface language is not English. */
  labels?: Partial<AdminShippedWidgetLabels>;
  ariaLabel?: (data: TData) => string;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

const DEFAULT_RANK_ROWS = 6;

function chartArray<T>(rows: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(rows) ? rows : [];
}

/**
 * The placeholder a chart tile shows while loading.
 *
 * Shaped like the drawing it is standing in for, so the tile does not change height when the chart
 * lands. `rows` draws ranked bars and no rows draws the columns of a time series, because one
 * placeholder standing for both would be right half the time.
 */
function ChartTileSkeleton({ rows, height }: { rows?: number; height?: number }) {
  if (rows) {
    return (
      <div className="space-y-2.5" data-widget-skeleton="rows">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3">
            <AdminSkeleton className="h-3 w-28" />
            <AdminSkeleton className="h-2.5 flex-1 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  const bars = [42, 68, 30, 84, 55, 72, 38];
  return (
    <div style={{ height: height ?? 220 }} data-widget-skeleton="columns" className="flex items-end gap-2 border-b border-zinc-200 px-1">
      {bars.map((bar, index) => (
        <AdminSkeleton key={index} className="flex-1 rounded-t" style={{ height: `${bar}%` }} />
      ))}
    </div>
  );
}

export function adminChartWidget<TData>(
  options: AdminChartWidgetOptions<TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readCategories = adminWidgetRequired(
    id,
    "a categories() that reads the chart's points",
    options.categories,
    "a chart cannot plot points it has no way to read",
  );
  const readSeries = adminWidgetRequired(
    id,
    "a series() that reads the chart's values",
    options.series,
    "a chart with no values draws an axis and nothing on it",
  );
  const emptyCopy = options.empty;
  const formatters = adminChartFormatters(options.unit ?? "count");
  const integerTicks = options.integerTicks ?? true;
  const height = options.height ?? 220;

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["md", "lg", "xl"],
    isEmpty: options.isEmpty ?? ((data) => chartArray(readCategories(data)).length === 0),
    renderLoading: () => <ChartTileSkeleton height={height} />,
    ...(emptyCopy
      ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> }
      : {}),
    render: (data) => (
      <AdminTimeSeriesChart
        ariaLabel={options.ariaLabel?.(data) ?? title}
        categories={chartArray(readCategories(data))}
        series={chartArray(readSeries(data))}
        formatters={formatters}
        variant={options.variant ?? "bar"}
        height={height}
        integerTicks={integerTicks}
      />
    ),
  });
}

/**
 * A ranked chart tile, which answers a different question from a time series and cannot be drawn as
 * one.
 *
 * A time series wants an ordered axis, because the order is the claim. Ranked things are not ordered
 * by anything an axis could show, so plotting them as a series is a category error, and a host
 * whose rows happen to be keyed by a date gets a line chart through them. Keeping this separate from
 * `adminChartWidget` is what stops that: the two take different inputs, and one of them cannot be
 * expressed as the other.
 */
export function adminRankWidget<TData>(
  options: AdminRankWidgetOptions<TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readItems = adminWidgetRequired(
    id,
    "an items() that reads the ranked rows",
    options.items,
    "a ranked chart cannot draw rows it has no way to read",
  );
  const emptyCopy = options.empty;
  const formatters = adminChartFormatters(options.unit ?? "count");
  const integerTicks = options.integerTicks ?? true;
  const cap = options.cap ?? { max: DEFAULT_RANK_ROWS };
  const copy = { ...defaultAdminShippedWidgetLabels, ...options.labels };

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["sm", "md", "lg"],
    isEmpty: options.isEmpty ?? ((data) => chartArray(readItems(data)).length === 0),
    renderLoading: () => <ChartTileSkeleton rows={3} />,
    ...(emptyCopy
      ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> }
      : {}),
    render: (data) => {
      const { rows, note } = adminWidgetCappedRows(chartArray(readItems(data)), cap, copy);
      return (
        <div>
          <AdminRankChart
            ariaLabel={options.ariaLabel?.(data) ?? title}
            items={rows}
            formatters={formatters}
            integerTicks={integerTicks}
            valueLabel={options.valueLabel}
          />
          {note ? <p className="mt-2 text-xs text-zinc-500">{note}</p> : null}
        </div>
      );
    },
  });
}
