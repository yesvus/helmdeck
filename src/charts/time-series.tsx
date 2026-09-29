// SPDX-License-Identifier: MIT

"use client";

/**
 * A chart over time: bars for a value per day, or lines for two series that have to be read against
 * each other.
 *
 * Drawn as plain SVG on a fixed viewBox rather than measured against its container, because the
 * only thing that has to be true of the width is that the whole drawing scales with it. A
 * `viewBox` does that with no resize observer, no layout read, and no first frame at the wrong
 * size, and the text scales with the drawing rather than reflowing out of its label. The hover
 * layer positions itself in percentages of that same viewBox for the same reason.
 *
 * The axis is drawn from `adminChartAxis`, so the top gridline is a round number above the data and
 * the reader can tell what the peak was without hovering it.
 */

import { useState } from "react";
import { adminChartAxis, adminChartLabelIndices } from "./scale.js";
import { adminChartSeriesClasses, type AdminChartCategory, type AdminChartSeries, type AdminChartSeriesClasses } from "./series-types.js";
import { AdminChartTable, type AdminChartFormatters } from "./table.js";
import { cn } from "../cn.js";

/** Wide enough that the axis labels are readable, scaled down by the viewBox rather than clipped. */
const VIEW_WIDTH = 720;
const AXIS_GUTTER = 60;
const TOP_PADDING = 10;
const BOTTOM_PADDING = 26;

/** A bar narrower than this reads as a hairline, and one wider than this reads as a block. */
const MIN_BAR = 1;
const MAX_BAR = 44;

function barWidth(band: number, seriesCount: number): number {
  const perSeries = (band * 0.72) / Math.max(1, seriesCount);
  return Math.max(MIN_BAR, Math.min(MAX_BAR, perSeries - (seriesCount > 1 ? 1 : 0)));
}

export function AdminTimeSeriesChart({
  categories,
  series,
  formatters,
  variant = "bar",
  height = 260,
  integerTicks = false,
  seriesClasses,
  className,
  ariaLabel,
}: {
  categories: ReadonlyArray<AdminChartCategory>;
  series: readonly AdminChartSeries[];
  formatters: AdminChartFormatters;
  variant?: "bar" | "line";
  height?: number;
  integerTicks?: boolean;
  seriesClasses?: readonly AdminChartSeriesClasses[];
  className?: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const peak = series.reduce(
    (highest, entry) => entry.values.reduce((inner, value) => Math.max(inner, value), highest),
    0,
  );
  const axis = adminChartAxis(peak, { ticks: 4, integer: integerTicks });

  const plotWidth = VIEW_WIDTH - AXIS_GUTTER - 8;
  const plotHeight = height - TOP_PADDING - BOTTOM_PADDING;
  const band = categories.length > 0 ? plotWidth / categories.length : plotWidth;
  const width = barWidth(band, series.length);
  const labelIndices = adminChartLabelIndices(categories.length);
  // `fraction` is 1 at the floor and 0 at the top, so it multiplies the plot height directly. A bar
  // of zero lands on the baseline with no height, which is what makes an empty day read as a gap.
  const y = (value: number) => TOP_PADDING + plotHeight * axis.fraction(value);

  const polyline = (entry: AdminChartSeries) =>
    entry.values
      .map((value, index) => `${AXIS_GUTTER + band * (index + 0.5)},${y(value)}`)
      .join(" ");

  const activeCategory = active === null ? null : categories[active];

  return (
    <figure className={cn("w-full", className)}>
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={ariaLabel}
          className="overflow-visible"
        >
          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={AXIS_GUTTER}
                x2={VIEW_WIDTH - 8}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-zinc-200"
                strokeWidth={1}
              />
              <text
                x={AXIS_GUTTER - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-500 text-[11px]"
              >
                {formatters.tick(tick)}
              </text>
            </g>
          ))}

          {categories.map((category, index) => {
            const x = AXIS_GUTTER + band * index + (band - width * series.length) / 2;
            return (
              <g key={category.key}>
                {series.map((entry, seriesIndex) => {
                  const value = entry.values[index] ?? 0;
                  const top = y(value);
                  const barHeight = TOP_PADDING + plotHeight - top;
                  const classes = adminChartSeriesClasses(seriesClasses, seriesIndex);
                  return (
                    <rect
                      key={entry.key}
                      // Distinguishes a mark from the hit area behind it, which is also a rect and
                      // covers the full plot height. Anything reading the drawing needs to tell a bar
                      // from the target that reveals it.
                      data-chart-mark={`${entry.key}:${category.key}`}
                      x={x + seriesIndex * width}
                      y={top}
                      width={width}
                      height={Math.max(0, barHeight)}
                      rx={3}
                      className={cn(
                        classes.fill,
                        active === index && "opacity-100",
                        active !== null && active !== index && "opacity-45",
                      )}
                    />
                  );
                })}
              </g>
            );
          })}

          {variant === "line"
            ? series.map((entry, seriesIndex) => {
                const classes = adminChartSeriesClasses(seriesClasses, seriesIndex);
                return (
                  <g key={entry.key}>
                    <polyline
                      points={polyline(entry)}
                      fill="none"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={classes.stroke}
                    />
                    {entry.values.map((value, index) => (
                      <circle
                        key={categories[index]?.key ?? index}
                        cx={AXIS_GUTTER + band * (index + 0.5)}
                        cy={y(value)}
                        r={active === index ? 5 : 3}
                        className={classes.fill}
                      />
                    ))}
                  </g>
                );
              })
            : null}

          {labelIndices.map((index) => {
            const category = categories[index];
            if (!category) return null;
            const anchor = index === 0 ? "start" : index === categories.length - 1 ? "end" : "middle";
            return (
              <text
                key={category.key}
                x={AXIS_GUTTER + band * (index + 0.5)}
                y={height - 8}
                textAnchor={anchor}
                className="fill-zinc-500 text-[11px]"
              >
                {category.label}
              </text>
            );
          })}

          {categories.map((category, index) => (
            <rect
              key={category.key}
              data-chart-hit={category.key}
              x={AXIS_GUTTER + band * index}
              y={TOP_PADDING}
              width={band}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>

        {activeCategory ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-zinc-200 bg-admin-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `${((AXIS_GUTTER + band * ((active ?? 0) + 0.5)) / VIEW_WIDTH) * 100}%` }}
          >
            <p className="font-semibold text-zinc-900">{activeCategory.label}</p>
            {series.map((entry) => (
              <p key={entry.key} className="mt-1 flex items-center gap-1.5 text-zinc-600">
                <span
                  className={cn("inline-block h-2 w-2 rounded-full", adminChartSeriesClasses(seriesClasses, series.indexOf(entry)).fill)}
                />
                {entry.label}
                <span className="font-semibold text-zinc-900">
                  {formatters.value(entry.values[active ?? 0] ?? 0)}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {series.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          {series.map((entry, seriesIndex) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span
                className={cn("inline-block h-2 w-2 rounded-full", adminChartSeriesClasses(seriesClasses, seriesIndex).fill)}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      <AdminChartTable
        caption={ariaLabel}
        categories={categories}
        series={series}
        format={formatters.value}
      />
    </figure>
  );
}
