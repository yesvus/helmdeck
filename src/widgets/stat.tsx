// SPDX-License-Identifier: MIT

/**
 * A stat tile: one figure, one caption, and where it came from.
 *
 * The decision this widget makes is the colour. A host asking for a tile almost never wants to
 * colour it by hand, because the thing that decides the colour is the comparison, and the
 * comparison is what the host is already loading. So an explicit tone wins when there is one, and
 * otherwise the trend decides: a rise is good, a fall is bad, and `invertTrend` swaps that for a
 * metric where down is the good direction. Without that, the most alarming tile on a dashboard is
 * the one whose number fell, and it is drawn in the same grey as everything else.
 *
 * A trend is drawn only where a rate exists. Zero a period ago and eight now is a difference and
 * not a percentage, and a figure that has not moved is not a trend at all, so both draw nothing
 * rather than a number nobody can act on.
 *
 * Server-safe: no directive and no hooks, so a definition declared in a server component renders
 * through the same panel as any other.
 */

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  adminFormatCents,
  adminFormatCentsCompact,
  adminFormatCount,
  adminFormatCountCompact,
} from "../charts/money.js";
import type { AdminChartUnit } from "../charts/table.js";
import { cn } from "../cn.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { adminToneClasses, type AdminTone } from "../primitives/tone.js";
import { defineAdminWidget } from "./registry.js";
import { adminWidgetRequired, type AdminWidgetEmptyCopy } from "./values.js";
import { defaultAdminShippedWidgetLabels, type AdminShippedWidgetLabels } from "./labels.js";
import type { AdminWidgetDefinition, AdminWidgetSize } from "./types.js";

export type AdminStatWidgetOptions<TData> = {
  id: string;
  title: string;
  description?: string;
  /**
   * Reads the figure. Answering with nothing is how the data declares the tile empty, so a field
   * the query no longer returns reaches the empty state rather than the screen as `undefined`.
   */
  value: (data: TData) => number | null | undefined;
  /** The same figure a period ago. Given it is what turns a number into a trend. */
  previous?: (data: TData) => number | null | undefined;
  /**
   * What the figure is measured in. `money` reads the number as whole cents and is the only place
   * the division by a hundred happens, so a total assembled here stays an integer.
   */
  unit?: AdminChartUnit;
  /** Shortens the figure, for a tile too narrow to hold every digit of a large count. */
  compact?: boolean;
  /** Whether a rise is the bad direction, as it is for churn, refunds and error rates. */
  invertTrend?: boolean;
  /** Overrides the colour the trend would have chosen. */
  tone?: AdminTone;
  /** Names the period the trend compares against, since "+12%" against nothing means little. */
  comparison?: string;
  /** The quiet line under the figure, where a host puts what the number is counted over. */
  detail?: (data: TData) => ReactNode;
  /** The words the trend is announced with, for a host whose interface language is not English. */
  labels?: Partial<AdminShippedWidgetLabels>;
  empty?: AdminWidgetEmptyCopy;
  isEmpty?: (data: TData) => boolean;
  sizes?: readonly AdminWidgetSize[];
};

const toneTextClasses = adminToneClasses(
  {
    neutral: "text-zinc-900",
    info: "text-sky-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
  },
  "text-red-700",
);

function statValueFormatter(unit: AdminChartUnit, compact: boolean): (value: number) => string {
  if (unit === "money") return compact ? adminFormatCentsCompact : adminFormatCents;
  return compact ? adminFormatCountCompact : adminFormatCount;
}

/** The rate of change against the earlier figure, or null where no rate exists. */
function adminStatTrend(
  value: number,
  previous: number | null | undefined,
): { direction: "up" | "down"; ratio: number } | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  if (value === previous) return null;
  return { direction: value > previous ? "up" : "down", ratio: (value - previous) / Math.abs(previous) };
}

/**
 * The tone a trend implies, which is the good direction in the tone that means it and the other one
 * otherwise. `invertTrend` is what a host sets for a metric whose fall is the good news.
 */
function adminStatTrendTone(
  direction: "up" | "down",
  invertTrend: boolean,
): Exclude<AdminTone, "error"> {
  const rising = direction === "up";
  if (invertTrend) return rising ? "danger" : "success";
  return rising ? "success" : "danger";
}

export function adminStatWidget<TData>(
  options: AdminStatWidgetOptions<TData>,
): AdminWidgetDefinition<TData> {
  const { id, title, description } = options;
  const readValue = adminWidgetRequired(id, "a value() that reads the figure", options.value, "a tile cannot show a number it has no way to read");
  const emptyCopy = options.empty;

  const format = statValueFormatter(options.unit ?? "count", options.compact === true);
  const percent = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "always",
  });
  const readPrevious = options.previous;
  const copy = { ...defaultAdminShippedWidgetLabels, ...options.labels };

  const readFigure = (data: TData): number | null => {
    const value = readValue(data);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return defineAdminWidget<TData>({
    id,
    title,
    description,
    sizes: options.sizes ?? ["sm", "md"],
    isEmpty: options.isEmpty ?? ((data) => readFigure(data) === null),
    // A skeleton in the shape of what arrives: a figure on one line and a caption under it, so the
    // tile does not change size when the number lands.
    renderLoading: () => (
      <div className="space-y-2" data-widget-skeleton="figure">
        <AdminSkeleton className="h-8 w-24" />
        <AdminSkeleton className="h-3 w-32" />
      </div>
    ),
    // Only claimed when the host has domain words for it. The engine's own empty state is a better
    // answer than a guess, and a generic "nothing to show" is honest where a specific one is not.
    ...(emptyCopy ? { renderEmpty: () => <AdminEmptyState title={emptyCopy.title} body={emptyCopy.body} /> } : {}),
    render: (data) => {
      const value = readFigure(data);
      // The engine only reaches `render` once `isEmpty` has said the data is not empty, so a
      // default `isEmpty` guarantees a figure here. A host that overrode it owns this fallback.
      if (value === null) return null;

      const trend = adminStatTrend(value, readPrevious?.(data));
      const tone = options.tone ?? (trend ? adminStatTrendTone(trend.direction, options.invertTrend === true) : "neutral");

      return (
        <div>
          <p className={cn("text-2xl font-semibold tabular-nums", toneTextClasses[tone])}>
            {format(value)}
          </p>
          {trend ? (
            <p
              data-stat-trend={trend.direction}
              className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-medium", toneTextClasses[tone])}
            >
              {trend.direction === "up" ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {/* The sign alone is not a direction to a screen reader, which may read the number
                  without the arrow that carries it for everyone else. */}
              <span className="sr-only">{trend.direction === "up" ? copy.trendUp : copy.trendDown}</span>
              <span>{percent.format(trend.ratio)}</span>
              {options.comparison ? (
                <span className="font-normal text-zinc-500">{options.comparison}</span>
              ) : null}
            </p>
          ) : null}
          {options.detail ? (
            <p className="mt-1 text-xs leading-5 text-zinc-500">{options.detail(data)}</p>
          ) : null}
        </div>
      );
    },
  });
}

