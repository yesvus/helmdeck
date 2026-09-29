// SPDX-License-Identifier: MIT

/**
 * Axis geometry, as pure numbers so the arithmetic behind a chart is checkable without a DOM.
 *
 * The whole point of this file is the one decision a hand-rolled chart usually gets wrong: a top
 * gridline that is not round. A maximum of 1,234,567 drawn against an axis that ends at 1,200,000
 * either clips the tallest bar or silently rescales it, and the reader has no way to tell which.
 * Rounding the top up to the next 1, 2, 2.5, 5 or 10 times a power of ten makes every gridline a
 * value a person can read off the axis and reuse in a sentence.
 */

/** Ticks land on these multiples of a power of ten, which is what makes the top gridline round. */
const TICK_STEPS = [1, 2, 2.5, 5, 10] as const;

/** Float noise from repeated multiplication would print as 0.30000000000000004 on an axis. */
function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

function clamp(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Round tick values from 0 up to and including a top that is at least `max`.
 *
 * A `max` that is zero, negative, or not a number returns a single tick rather than throwing: a
 * chart with nothing to draw still has to produce an axis, and the caller decides that an all-zero
 * domain is an empty state instead of a flat line.
 *
 * `integer` rounds the step up to a whole number, for domains that count things. A tick at 2.5
 * units of stock or 2.5 orders is a number nobody can act on, and the rounding costs at most one
 * extra gridline.
 */
export function adminChartTicks(max: number, count = 4, integer = false): number[] {
  if (!Number.isFinite(max) || max <= 0 || count < 1) return [0];

  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const chosen = TICK_STEPS.find((step) => normalized <= step) ?? TICK_STEPS[TICK_STEPS.length - 1];
  // Rounded up only for an integer domain. Rounding a fractional step up would turn a 0.1 step
  // into 1, which puts every sub-unit axis at a single tick.
  const step = integer ? Math.max(1, Math.ceil(chosen * magnitude)) : chosen * magnitude;
  const top = Math.ceil(max / step) * step;
  const divisions = Math.round(top / step);

  return Array.from({ length: divisions + 1 }, (_, index) => tidy(index * step));
}

export type AdminChartAxis = {
  /** The value at the top of the axis: a tick, and never below the data. */
  top: number;
  ticks: number[];
  /** Where a value sits in the plot area, 0 at the floor and 1 at the top. */
  fraction: (value: number) => number;
};

export function adminChartAxis(
  max: number,
  options: { ticks?: number; integer?: boolean } = {},
): AdminChartAxis {
  const values = adminChartTicks(max, options.ticks ?? 4, options.integer ?? false);
  const top = values[values.length - 1] ?? 0;
  return {
    top,
    ticks: values,
    // Values outside the domain are pinned to the edges rather than drawn off the plot, so a row
    // that arrives out of order cannot paint a bar taller than its own axis.
    fraction: (value) => (top === 0 ? 0 : 1 - clamp(value, 0, top) / top),
  };
}

/**
 * How many category labels to print, and which ones.
 *
 * Thirty daily labels collide into an unreadable smear, and dropping them silently makes a reader
 * assume the gaps are missing data. So the engine picks first, middle and last, and returns the
 * indices it chose, which is also what the hidden table is built from.
 */
export function adminChartLabelIndices(total: number, limit = 7): number[] {
  if (total <= 0) return [];
  if (total <= limit) return Array.from({ length: total }, (_, index) => index);

  const chosen = new Set<number>([0, total - 1]);
  for (let slot = 1; slot < limit - 1; slot += 1) {
    chosen.add(Math.round((slot * (total - 1)) / (limit - 1)));
  }
  return [...chosen].sort((left, right) => left - right);
}
