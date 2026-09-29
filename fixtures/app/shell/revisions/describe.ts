// SPDX-License-Identifier: MIT
import type { RevisionCause } from "../../../lib/demo-revisions";

/**
 * How a revision reads on screen.
 *
 * The cause leads because it is the question a person asks of a history first: was this an edit, or
 * did something go live, or did somebody put an old version back. A row that showed the same title
 * three times with three timestamps would answer none of that.
 */
export const causeLabels: Record<RevisionCause, string> = {
  edit: "Edited",
  publish: "Published",
  unpublish: "Unpublished",
  restore: "Restored",
};

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** UTC and a fixed locale, so the same revision reads the same way wherever the page is rendered. */
export function formatWhen(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : `${when.format(parsed)} UTC`;
}

/** Enough of the body to recognise the version, and not so much that the list stops being a list. */
export function preview(value: string, limit = 160): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}
