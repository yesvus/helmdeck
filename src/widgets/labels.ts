// SPDX-License-Identifier: MIT

/**
 * The words the shipped tiles print themselves, gathered so a dictionary can reach them.
 *
 * Every string here is one a reader sees: the note under a capped tile, the ages in a feed, the
 * direction a stat's trend moved. The tiles cannot read a context, because a widget definition is a
 * plain object a server component builds, so these arrive the way the rest of the package's
 * overridable copy arrives: as an option, defaulting to the English below.
 *
 * The counts are functions rather than templates because a sentence that takes a number is the one
 * a translation can quietly break, and a host's language is not this package's to assemble for it.
 */

import { adminWidgetCapNote } from "./values.js";

export type AdminShippedWidgetLabels = {
  /** Under a tile that draws fewer rows than the answer holds. */
  capNote: (shown: number, total: number) => string;
  /** An event from within the last minute, where a count of zero says nothing. */
  justNow: string;
  minutesAgo: (count: number) => string;
  hoursAgo: (count: number) => string;
  daysAgo: (count: number) => string;
  /** Past a week the count stops being the fact, so the day itself is printed instead. */
  ageDate: (date: Date) => string;
  /** An event whose timestamp could not be read at all. */
  unknownTime: string;
  /** Spoken beside a stat's trend, where the arrow carries the direction for everyone else. */
  trendUp: string;
  trendDown: string;
};

export const defaultAdminShippedWidgetLabels: AdminShippedWidgetLabels = {
  capNote: adminWidgetCapNote,
  justNow: "just now",
  minutesAgo: (count) => `${count} ${count === 1 ? "minute" : "minutes"} ago`,
  hoursAgo: (count) => `${count} ${count === 1 ? "hour" : "hours"} ago`,
  daysAgo: (count) => `${count} ${count === 1 ? "day" : "days"} ago`,
  ageDate: (date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date),
  unknownTime: "at an unknown time",
  trendUp: "Up",
  trendDown: "Down",
};
