// SPDX-License-Identifier: MIT

/**
 * The date arithmetic the calendar does, kept out of the component so it can be reasoned about
 * without a renderer.
 *
 * Every day is a day index, the number of days since the epoch, and every date is `YYYY-MM-DD`.
 * A day index is used rather than a timestamp because a timestamp is a moment in time: the same
 * day is a different moment in every time zone, and a calendar that shifts a day when the reader
 * travels is a calendar that is wrong.
 */

export type AdminCalendarDay = {
  year: number;
  month: number;
  day: number;
};

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The date a day falls on, at midnight UTC.
 *
 * The year is set with `setUTCFullYear` rather than through `Date.UTC`, because `Date.UTC` reads a
 * year under a hundred as a year in the twentieth century, and a calendar that gives 0050 a
 * different day than 1950 is a calendar with two answers to the same question.
 */
function adminDayTimestamp(day: AdminCalendarDay): number {
  const date = new Date(0);
  date.setUTCFullYear(day.year, day.month - 1, day.day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function daysInAdminMonth(year: number, month: number): number {
  const date = new Date(0);
  // The day zero of the month after this one is the last day of this one.
  date.setUTCFullYear(year, month, 0);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCDate();
}

export function adminDayIndex(day: AdminCalendarDay): number {
  return adminDayTimestamp(day) / 86_400_000;
}

export function adminDayFromIndex(index: number): AdminCalendarDay {
  const date = new Date(index * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function formatAdminDay(day: AdminCalendarDay): string {
  return `${String(day.year).padStart(4, "0")}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

export function parseAdminDay(value: string): AdminCalendarDay | null {
  const match = DAY_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInAdminMonth(year, month)) return null;
  return { year, month, day };
}

export function adminDayOfWeek(index: number): number {
  return new Date(index * 86_400_000).getUTCDay();
}

/** The month a day belongs to, as `YYYY-MM`. */
export function adminMonthOf(day: AdminCalendarDay): string {
  return `${String(day.year).padStart(4, "0")}-${String(day.month).padStart(2, "0")}`;
}

export function parseAdminMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function addAdminMonths(month: { year: number; month: number }, delta: number): { year: number; month: number } {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The day the week starts on, in the reader's locale. Monday in most of the world and Sunday in
 * the United States, Canada and Japan, among others.
 */
export function adminFirstDayOfWeek(locale: string): number {
  try {
    const resolved = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = resolved.getWeekInfo?.() ?? resolved.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay;
  } catch {
    // A locale the runtime does not know falls back to the week that starts on Monday.
  }
  return 1;
}
