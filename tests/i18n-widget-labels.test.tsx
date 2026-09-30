// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  adminActivityWidget,
  adminListWidget,
  adminStatWidget,
} from "../src/widgets";
import {
  englishAdminMessages,
  turkishAdminMessages,
  type AdminMessages,
} from "../src/i18n/messages";
import { defaultAdminShippedWidgetLabels, type AdminShippedWidgetLabels } from "../src/widgets/labels";

/**
 * The words the six shipped tiles print themselves, and the two ways they can be wrong.
 *
 * The type already requires the section, so a locale missing a key does not compile. What it cannot
 * require is that the string is translated: a Turkish dictionary answering with the English text
 * type-checks perfectly and reads as though localisation is broken, which is worse than a key that is
 * obviously absent. So the shape and the translation are checked separately here, the same split
 * `i18n-list-labels.test.ts` makes for the list's query strings.
 *
 * Two things make this section its own case rather than another `resourceList`. The ages are
 * assembled from thresholds in the widget and the words come from here, so a key that is present but
 * never read leaves English on the screen while every check below still passes. And four of the nine
 * are functions taking a number, which is the one a translation can quietly break by dropping the
 * argument.
 */
const LOCALES: { name: string; messages: AdminMessages }[] = [
  { name: "en", messages: englishAdminMessages },
  { name: "tr", messages: turkishAdminMessages },
];

/** A fixed date, so a formatter's output is the same on every run and in every timezone. */
const AGED = new Date("2026-09-23T12:00:00.000Z");

/**
 * What each key prints for one fixed set of arguments, so a key can be compared across locales
 * without knowing whether it is a string or a function. The arguments are deliberately not 1: a
 * plural that only reads right for one would pass a comparison made against a single row.
 */
const SAMPLE: Record<keyof AdminShippedWidgetLabels, unknown[]> = {
  capNote: [3, 40],
  justNow: [],
  minutesAgo: [4],
  hoursAgo: [4],
  daysAgo: [4],
  ageDate: [AGED],
  unknownTime: [],
  trendUp: [],
  trendDown: [],
};

function printed(labels: AdminShippedWidgetLabels, key: keyof AdminShippedWidgetLabels): string {
  const value = labels[key];
  const args = SAMPLE[key] as never[];
  return typeof value === "function" ? String((value as (...a: never[]) => unknown)(...args)) : value;
}

type FeedRow = { id: string; name: string; at: Date };

/** Enough of a tile's rows to reach every string it can print, including the cap note. */
const capRows = (count: number): FeedRow[] =>
  Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, name: `Row ${index}`, at: AGED }));

describe("the shipped tiles' own strings", () => {
  it("gives every locale every key, which the type requires and this confirms", () => {
    for (const { name, messages } of LOCALES) {
      const missing = Object.keys(defaultAdminShippedWidgetLabels).filter(
        (key) => (messages.shippedWidget as Record<string, unknown>)[key] === undefined,
      );
      expect(missing, `${name} is missing a widget string`).toEqual([]);
    }
  });

  it("translates every string rather than leaving the English in place", () => {
    // The English values are gathered by running the defaults rather than written out here, so this
    // cannot become a third copy that drifts from the tiles' own. A key holding a function is
    // compared by what it prints, because a Turkish key holding the English function under a
    // different name type-checks perfectly and says nothing new.
    const untranslated = (Object.keys(defaultAdminShippedWidgetLabels) as Array<keyof AdminShippedWidgetLabels>)
      .filter((key) => printed(turkishAdminMessages.shippedWidget, key) === printed(englishAdminMessages.shippedWidget, key));

    expect(untranslated, "a Turkish string that is still the English one").toEqual([]);
  });

  it("keeps the numbers a count carries, because a translated count that drops them is worse", () => {
    // Turkish has no plural suffix after a numeral, so a minute and forty minutes read the same. The
    // number is the only thing distinguishing them, and losing it turns both into "0 minutes ago".
    const turkish = turkishAdminMessages.shippedWidget;
    expect(turkish.minutesAgo(1)).toContain("1");
    expect(turkish.minutesAgo(40)).toContain("40");
    expect(turkish.hoursAgo(5)).toContain("5");
    expect(turkish.daysAgo(3)).toContain("3");

    const note = turkish.capNote(8, 40);
    expect(note).toContain("8");
    expect(note).toContain("40");
  });

  it("reads the English defaults from the tiles' own defaults, so the two cannot diverge", () => {
    // A tile built with no labels of its own prints these, and so does a host with no dictionary at
    // all, which makes them the same strings or the same fact has two answers.
    expect(englishAdminMessages.shippedWidget).toBe(defaultAdminShippedWidgetLabels);
  });

  it("formats a date in the locale's own order, rather than English's in a Turkish dictionary", () => {
    // The one key whose value is a locale, not a word. en-US and tr-TR both carry a month, a day and
    // a year, so the key can be present and the date can still read as an American one.
    const english = defaultAdminShippedWidgetLabels.ageDate(AGED);
    const turkish = turkishAdminMessages.shippedWidget.ageDate(AGED);
    expect(turkish).not.toBe(english);
    expect(turkish).toContain("2026");
  });
});

describe("a tile given the Turkish dictionary", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const labels = turkishAdminMessages.shippedWidget;

  it("prints a cap note in Turkish rather than the English it falls back to", () => {
    const definition = adminListWidget({
      id: "top",
      title: "Top",
      labels,
      rows: (data: FeedRow[]) => data,
      label: (row: FeedRow) => row.name,
    });
    render(<>{definition.render?.(capRows(9))}</>);
    expect(screen.getByText(labels.capNote(5, 9))).toBeInTheDocument();
    expect(screen.queryByText(defaultAdminShippedWidgetLabels.capNote(5, 9))).not.toBeInTheDocument();
  });

  it("speaks a stat's trend in Turkish, where the arrow carries the direction for everyone else", () => {
    const definition = adminStatWidget({
      id: "revenue",
      title: "Revenue",
      labels,
      value: (data: { total: number }) => data.total,
      previous: (data: { total: number }) => data.total / 2,
    });
    render(<>{definition.render?.({ total: 100 })}</>);
    // Screen-reader text only, so it is queried rather than looked for.
    expect(screen.getByText(labels.trendUp)).toBeInTheDocument();
  });

  it("assembles an age from the Turkish words, at every threshold the feed owns", () => {
    const definition = adminActivityWidget({
      id: "feed",
      title: "Feed",
      labels,
      now: () => now,
      rows: (data: FeedRow[]) => data,
      message: (row: FeedRow) => row.name,
      at: () => now,
    });
    render(<>{definition.render?.(capRows(1))}</>);
    expect(screen.getByText(labels.justNow)).toBeInTheDocument();
  });
});
