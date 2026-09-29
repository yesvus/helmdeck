// SPDX-License-Identifier: MIT

/**
 * Turning rows into the points a chart draws.
 *
 * The trap this file exists to avoid is plotting only the days that have rows. A store holds no row
 * for a day nothing happened, so a chart built from the rows alone draws a straight line across a
 * weekend and reports it as a trend. The range is stated first and every day in it is emitted,
 * including the zeros, so a gap reads as a gap and the empty state is reachable by the data being
 * empty rather than by a host writing it by hand.
 */

export type AdminChartPoint = { key: string; label: string; value: number };

/**
 * The UTC day a timestamp falls on, or null when it is not a timestamp.
 *
 * Both shapes the store produces are accepted deliberately: SQLite's `datetime('now')` yields
 * `2026-09-29 12:34:56` with a space and no zone, and ISO yields `2026-09-29T12:34:56.000Z`. Both
 * begin with the same ten characters, and both are UTC by construction, so the day is the prefix
 * rather than a `new Date(...)` parse whose result depends on the server's zone.
 */
export function adminChartDayKey(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

const DAY_IN_MS = 86_400_000;

/**
 * The `days` day keys ending on the day containing `end`, oldest first.
 *
 * Stepping backwards in milliseconds from a date and reading the UTC prefix keeps every key a real
 * calendar day across a daylight-saving boundary, which adding 86,400,000 to a local midnight does
 * not.
 */
export function adminChartDayRange(days: number, end: Date): string[] {
  const total = Math.max(0, Math.floor(days));
  return Array.from({ length: total }, (_, index) => {
    const day = new Date(end.getTime() - (total - index - 1) * DAY_IN_MS);
    return adminChartDayKey(day.toISOString()) ?? "";
  });
}

/**
 * One point per day in `keys`, in order, taking each value from `totals` and zero where absent.
 *
 * A day key the totals map does not mention is a day with no rows, which is a zero rather than a
 * hole: the axis needs a point per category or the bars and the labels stop lining up.
 */
export function adminChartFillDays(
  keys: readonly string[],
  totals: ReadonlyMap<string, number>,
  label: (key: string) => string,
): AdminChartPoint[] {
  return keys.map((key) => ({ key, label: label(key), value: totals.get(key) ?? 0 }));
}
