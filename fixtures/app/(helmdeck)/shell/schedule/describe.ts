// SPDX-License-Identifier: MIT
import type { PostScheduleState } from "../../../../lib/demo-scheduling";

/**
 * How a schedule reads on screen.
 *
 * The moment leads, because the question a person opens this page with is "when does this go live",
 * and the state is beside it because the question after that one is "has it". A row that showed the
 * state first would answer the second question to somebody who has not asked it yet.
 */

/** What each state means, in the words the page uses. Anything else is a row this demo cannot read. */
export const stateLabels: Record<PostScheduleState | "unknown", string> = {
  pending: "Waiting",
  published: "Published",
  cancelled: "Cancelled",
  unknown: "Unreadable",
};

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** UTC and a fixed locale, so the same moment reads the same way wherever the page is rendered. */
export function formatWhen(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : `${when.format(parsed)} UTC`;
}

/** Whether a moment has arrived, which is what makes a row due rather than waiting. */
export function isDue(publishAt: string, now: number): boolean {
  const parsed = Date.parse(publishAt);
  return Number.isFinite(parsed) && parsed <= now;
}

/**
 * A stored moment as a `datetime-local` field reads it, in UTC like everything else here.
 *
 * The field sends back the literal text it holds, with no offset attached, so a value rendered in
 * the viewer's own zone and read as UTC would store a moment nobody chose. One zone for the form, the
 * column, the refusal and the history is worth more than a moment in the reader's local clock, and
 * the field says UTC beside it so nobody has to guess.
 */
export function momentForInput(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 16);
}
