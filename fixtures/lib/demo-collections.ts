// SPDX-License-Identifier: MIT
"use server";

import {
  adminWidgetSizes,
  type AdminPermission,
  type AdminSession,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { requireDemoSession } from "./demo-guard";
import { demoPersistence } from "./demo-persistence";
import { ensureDemoSeeded } from "./ensure-seeded";
import type { LandingSection } from "../app/shell/pages/landing-registry";

/**
 * The landing page's sections, persisted as rows, over a server action.
 *
 * `AdminCollectionEditor` is uncontrolled by design: it holds no copy of the entries, so the host has
 * to hold the value and has to put it somewhere. Component state is somewhere a reload empties, which
 * would make "the edit survived a refresh" untestable rather than merely untrue, so the value goes to
 * the store the rest of the demo already reads and writes.
 *
 * **A section's identity arrives from the browser, so it is checked rather than trusted.** An id is
 * the table's primary key, so an id this page does not own is an identity belonging to another page's
 * rows, and accepting one would be a way to move them. The engine mints `col_<n>` and the seeded rows
 * below are `sec_<name>`, so neither can be aimed at a row this page has never seen.
 *
 * `users` and `sessions` are unreachable here because the only resource named below is a constant:
 * nothing the browser sends can select a table.
 */

const LANDING_RESOURCE = "landing_sections";
const LANDING_PAGE = "landing";
const MAX_SECTIONS = 200;

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Operation = "read" | "create" | "update" | "delete";

/**
 * The row as the table holds it. `content` is the section's own document, which is where the fields
 * the engine has no column for live.
 */
type LandingRow = {
  id: string;
  page: string;
  kind: string;
  title: string;
  position: number;
  content: unknown;
};

function permits(session: AdminSession, operation: Operation): boolean {
  return demoCan(session, `${LANDING_RESOURCE}.${operation}` as AdminPermission);
}

/**
 * The one rule, asked per operation rather than once for the page.
 *
 * `demoCan` is what decides which controls render, so asking it here is what stops a button and the
 * action behind it from disagreeing. A save asks for `update` first, because every save renumbers
 * positions, and asks for `create` or `delete` only for the two cases that genuinely need them.
 */
async function access(operation: Operation): Promise<AdminSession> {
  const session = await requireDemoSession({ returnTo: "/shell/pages" });
  if (!permits(session, operation)) {
    throw new Error(`This session may not ${operation} ${LANDING_RESOURCE}`);
  }
  // Before any read, so the first request of a fresh process finds a page rather than an empty
  // editor. Memoised inside, so it costs nothing after the first call.
  await ensureDemoSeeded();
  return session;
}

/**
 * A text column as the string it was written as.
 *
 * The driver parses a text column on the way back when it happens to be valid JSON, so a heading of
 * "42" arrives as the number 42 and one of "null" arrives as nothing at all. Coerced rather than
 * trusted, so a person's heading survives a round trip whatever it happens to look like as JSON.
 */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  // An absent key is an empty column, but a null is not: `title` is NOT NULL, so the only way one
  // arrives here as null is the driver having parsed the four letters, and writing back an empty
  // heading would quietly swallow a section's name.
  if (value === undefined) return "";
  return String(value);
}

/** The section's own document, whether it arrived as the text written or already parsed. */
function documentOf(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return documentOf(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function byPosition(left: LandingRow, right: LandingRow): number {
  return left.position - right.position;
}

async function allRows(): Promise<LandingRow[]> {
  return demoPersistence().adapter.query<LandingRow>(LANDING_RESOURCE);
}

async function landingRows(): Promise<LandingRow[]> {
  const rows = await allRows();
  return rows.filter((row) => textOf(row.page) === LANDING_PAGE).sort(byPosition);
}

function toEntry(row: LandingRow): LandingSection {
  const width = documentOf(row.content).size;
  return {
    id: textOf(row.id),
    widget: textOf(row.kind),
    size: adminWidgetSizes.includes(width as AdminWidgetSize) ? (width as AdminWidgetSize) : "sm",
    title: textOf(row.title),
  };
}

function toRow(section: LandingSection, position: number): LandingRow {
  return {
    id: section.id,
    page: LANDING_PAGE,
    kind: section.widget,
    title: section.title,
    position,
    // Only the width lives in the document. A key the browser attached to an entry cannot reach a
    // column the table does not have, and cannot reach this one either, because the document is
    // rebuilt here rather than taken from what arrived.
    content: JSON.stringify({ size: section.size }),
  };
}

export async function readLandingSections(): Promise<LandingSection[]> {
  await access("read");
  return (await landingRows()).map(toEntry);
}

/**
 * Replaces the arrangement with `sections`, as one write.
 *
 * Reconcile rather than one action per operation, because the editor reports the whole collection on
 * every change, so an add and a reorder are the same message by the time the host sees it.
 *
 * **No delete, and that is what lets an editor use the page at all.** The editor role is refused
 * deletions everywhere else in this demo, which is the rule working rather than a limit to route
 * around, so a save that cleared the table and wrote it back would refuse every editor save. Instead
 * the owned rows are updated in place, and a row only stops existing when a person removes the
 * section, which is the one thing here that asks for `delete`.
 *
 * `position` is unique per page, so a row cannot be moved onto a position another row still holds.
 * Every owned row is therefore parked at a negative position first, which the migration allows
 * precisely so a swap can be written in two passes, and none of the two can fail halfway through a
 * collision.
 */
export async function saveLandingSections(sections: LandingSection[]): Promise<void> {
  const session = await access("update");

  if (!Array.isArray(sections)) {
    throw new Error("The landing page arrangement must be a list of sections");
  }
  if (sections.length > MAX_SECTIONS) {
    throw new Error(`That is more sections than a landing page can hold`);
  }

  const rows = await allRows();
  const owned = rows.filter((row) => textOf(row.page) === LANDING_PAGE);
  const foreign = new Set(
    rows.filter((row) => textOf(row.page) !== LANDING_PAGE).map((row) => textOf(row.id)),
  );
  const stored = new Set(owned.map((row) => textOf(row.id)));

  const kept = new Set<string>();
  const wanted = sections.map((section, position) => {
    const id = typeof section?.id === "string" ? section.id : "";
    if (!SAFE_ID.test(id) || foreign.has(id)) {
      throw new Error(`"${id}" is not a section of this landing page`);
    }
    // A duplicated id makes every later move apply to whichever copy happened to sort first, which
    // is the one bug an arrangement cannot be allowed to have.
    if (kept.has(id)) {
      throw new Error(`"${id}" appears twice in the arrangement`);
    }
    kept.add(id);

    // The registry owns whether a section means anything, because a build that drops a section has to
    // keep rendering the rows that name it. What is refused here is a kind the column cannot hold.
    const kind = typeof section.widget === "string" ? section.widget : "";
    if (!kind.trim()) {
      throw new Error(`Section "${id}" has not been given a section yet`);
    }

    const size = String(section.size ?? "");
    if (!adminWidgetSizes.includes(size as AdminWidgetSize)) {
      throw new Error(`"${size}" is not a section width`);
    }
    return { section: { ...section, widget: kind, title: textOf(section.title) }, position };
  });

  const keptIds = new Set(wanted.map(({ section }) => section.id));
  const added = wanted.filter(({ section }) => !stored.has(section.id));
  const dropped = owned.filter((row) => !keptIds.has(textOf(row.id)));

  // Asked before anything is written, so a refusal leaves the stored arrangement exactly as it was
  // rather than half of one arrangement and half of another.
  if (added.length > 0 && !permits(session, "create")) {
    throw new Error(`This session may not create ${LANDING_RESOURCE}`);
  }
  if (dropped.length > 0 && !permits(session, "delete")) {
    throw new Error(`This session may not delete ${LANDING_RESOURCE}`);
  }

  const adapter = demoPersistence().adapter;

  for (const [index, row] of owned.entries()) {
    await adapter.update(LANDING_RESOURCE, textOf(row.id), toRow(toEntry(row), -(index + 1)));
  }

  for (const { section, position } of wanted) {
    if (stored.has(section.id)) {
      await adapter.update(LANDING_RESOURCE, section.id, toRow(section, position));
    }
  }

  for (const { section, position } of added) {
    await adapter.create(LANDING_RESOURCE, toRow(section, position));
  }

  // Last, so a removal is the only thing that can leave a page with a section that was meant to be
  // gone, rather than a page missing one that was meant to stay.
  for (const row of dropped) {
    await adapter.delete(LANDING_RESOURCE, textOf(row.id));
  }
}
