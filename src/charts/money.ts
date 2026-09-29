// SPDX-License-Identifier: MIT

/**
 * Money and counts, formatted from the numbers the store actually holds.
 *
 * Every amount crosses the boundary as an integer number of cents and is summed, compared and
 * scaled as that integer. The division by 100 happens here, once, at the moment of display, and
 * never earlier. A total assembled by adding already-formatted strings is a different number from
 * the one the ledger holds as soon as rounding is involved, and it reads correctly on screen while
 * being wrong, which is the failure that survives review.
 */

export type AdminChartNumberOptions = { locale?: string; currency?: string };

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "USD";

/**
 * Formatters are cached because an axis asks for the same one once per gridline, and a chart is
 * re-rendered on every hover. `Intl.NumberFormat` construction is the expensive part, not the format.
 */
const cache = new Map<string, Intl.NumberFormat>();

function formatter(options: Intl.NumberFormatOptions, locale: string): Intl.NumberFormat {
  const key = `${locale}|${options.style ?? "decimal"}|${options.currency ?? ""}|${options.notation ?? "standard"}|${options.minimumFractionDigits ?? ""}.${options.maximumFractionDigits ?? ""}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat(locale, options);
  cache.set(key, created);
  return created;
}

function moneyOptions(
  { currency = DEFAULT_CURRENCY }: AdminChartNumberOptions,
  compact: boolean,
): Intl.NumberFormatOptions {
  return compact
    ? { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }
    : { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
}

/** The full amount, for a headline or a tooltip where every cent is the point. */
export function adminFormatCents(cents: number, options: AdminChartNumberOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  return formatter(moneyOptions(options, false), locale).format(cents / 100);
}

/**
 * The abbreviated amount, for an axis where six gridlines have to fit in the width of a card.
 *
 * The same integer cents in, and `$1.2K` is only ever a label for the tick it sits beside: the
 * number the chart scales is still the full integer.
 */
export function adminFormatCentsCompact(cents: number, options: AdminChartNumberOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  return formatter(moneyOptions(options, true), locale).format(cents / 100);
}

/** A whole number of things, such as units in stock or orders placed. */
export function adminFormatCount(value: number, locale = DEFAULT_LOCALE): string {
  return formatter({}, locale).format(value);
}

/** The same number, shortened, for an axis over a count. */
export function adminFormatCountCompact(value: number, locale = DEFAULT_LOCALE): string {
  return formatter({ notation: "compact", maximumFractionDigits: 1 }, locale).format(value);
}
