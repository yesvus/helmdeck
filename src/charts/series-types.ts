// SPDX-License-Identifier: MIT

/**
 * The shapes a chart takes as input, in one place.
 *
 * A `series` is a label and one value per category, and a `category` is a key and a display label.
 * Keeping them apart is what lets a host hand over rows shaped for its own table and have the chart
 * index into them rather than re-key the data into a shape it already agreed on once.
 */

export type AdminChartCategory = { key: string; label: string };

export type AdminChartSeries = {
  key: string;
  label: string;
  /** One value per category, in category order. A short array is read as zero for what is missing. */
  values: number[];
};

export type AdminChartSeriesClasses = { fill: string; stroke: string };

/**
 * The default palette, as complete Tailwind class names.
 *
 * Written out in full rather than composed from a colour suffix, because Tailwind generates a
 * utility only when it can read the whole class name in the source, and `fill-${colour}` produces
 * nothing at build time. The second series is the muted grey on purpose: a comparison series that
 * is deliberately quieter than the one being compared against reads as context, and leotron's two
 * series use the same arrangement.
 */
export const defaultAdminChartSeriesClasses: readonly AdminChartSeriesClasses[] = [
  { fill: "fill-brand-500", stroke: "stroke-brand-500" },
  { fill: "fill-zinc-500", stroke: "stroke-zinc-500" },
  { fill: "fill-emerald-600", stroke: "stroke-emerald-600" },
  { fill: "fill-amber-700", stroke: "stroke-amber-700" },
  { fill: "fill-red-600", stroke: "stroke-red-600" },
  { fill: "fill-zinc-300", stroke: "stroke-zinc-300" },
];

export function adminChartSeriesClasses(
  classes: readonly AdminChartSeriesClasses[] = defaultAdminChartSeriesClasses,
  index: number,
): AdminChartSeriesClasses {
  return classes[index % classes.length] ?? defaultAdminChartSeriesClasses[0];
}
