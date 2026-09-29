// SPDX-License-Identifier: MIT

/**
 * The values behind a chart, in a form a screen reader can read.
 *
 * An SVG chart is an image to a screen reader: it can announce a summary and nothing else, so every
 * number in it is unreachable without a mouse. The table is that missing path, and it is built from
 * the same points the marks are drawn from, so it cannot disagree with them.
 */

import {
  adminFormatCents,
  adminFormatCentsCompact,
  adminFormatCount,
  adminFormatCountCompact,
} from "./money.js";
import type { AdminChartSeries } from "./series-types.js";

export type AdminChartUnit = "money" | "count";

export type AdminChartFormatters = {
  /** Every digit, for a tooltip and for this table. */
  value: (value: number) => string;
  /** Shortened, for an axis. Defaults to the precise one when the host does not shorten it. */
  tick: (value: number) => string;
};

export function adminChartFormatters(
  unit: AdminChartUnit,
  options: { locale?: string; currency?: string } = {},
): AdminChartFormatters {
  return unit === "money"
    ? {
        value: (value) => adminFormatCents(value, options),
        tick: (value) => adminFormatCentsCompact(value, options),
      }
    : {
        value: (value) => adminFormatCount(value, options.locale),
        tick: (value) => adminFormatCountCompact(value, options.locale),
      };
}

export function AdminChartTable({
  caption,
  categories,
  series,
  format,
}: {
  caption: string;
  categories: ReadonlyArray<{ key: string; label: string }>;
  series: readonly AdminChartSeries[];
  format: (value: number) => string;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((entry) => (
              <th key={entry.key} scope="col">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category, index) => (
            <tr key={category.key}>
              <th scope="row">{category.label}</th>
              {series.map((entry) => (
                <td key={entry.key}>{format(entry.values[index] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
