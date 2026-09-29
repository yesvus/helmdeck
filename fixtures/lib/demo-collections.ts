// SPDX-License-Identifier: MIT
"use server";

import {
  adminWidgetSizes,
  type AdminDashboardPlacement,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import { requireDemoSession } from "./demo-guard";
import { demoPersistence } from "./demo-persistence";
import { ensureDemoSeeded } from "./ensure-seeded";

/**
 * The landing page's sections, persisted as rows, over a server action.
 *
 * `AdminCollectionEditor` is uncontrolled by design: it holds no copy of the entries, so the host has
 * to hold the value and has to put it somewhere. Component state is somewhere a reload empties, which
 * would make "the edit survived a refresh" untestable rather than merely untrue, so the value goes to
 * the store the rest of the demo already reads and writes.
 *
 * **A section's identity arrives from the browser, so it is checked rather than trusted.** The demo's
 * engine dashboard keeps its placements in this same table, so an id accepted on its word would be a
 * way to move one of its tiles onto this page. An incoming id must be one this page already owns or
 * one no row anywhere in the table holds, which is what an added section is: the engine mints
 * `col_<n>` and the seeded rows below are `sec_<name>`, so neither can be aimed at a foreign row.
 *
 * `users` and `sessions` are unreachable here because the only resource named below is a constant:
 * nothing the browser sends can select a table.
 */

const LANDING_RESOURCE = "dashboard_placements";
const LANDING_DASHBOARD = "landing";

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

type LandingRow = {
  id: string;
  dashboard: string;
  widget: string;
  size: string;
  position: number;
};

const seededSections: ReadonlyArray<{ id: string; widget: string; size: AdminWidgetSize }> = [
  { id: "sec_hero", widget: "hero", size: "xl" },
  { id: "sec_features", widget: "features", size: "lg" },
  { id: "sec_pricing", widget: "pricing", size: "md" },
  { id: "sec_faq", widget: "faq", size: "sm" },
];

/**
 * Who may arrange the landing page, decided on the server because that is the only side holding the
 * session.
 *
 * It asks its own question rather than `demoCan`, which answers whether a session may touch an
 * exposed resource table, and arranging this page is not one of those.
 */
async function canArrangeLanding(): Promise<void> {
  const session = await requireDemoSession({ returnTo: "/shell/pages" });
  if (!session) {
    throw new Error("This session may not arrange the landing page");
  }
  await ensureDemoSeeded();
}

function byPosition(a: LandingRow, b: LandingRow): number {
  return a.position - b.position;
}

/** Every row of the table, so a foreign dashboard's identity can be recognised and refused. */
async function allRows(): Promise<LandingRow[]> {
  return demoPersistence().adapter.query<LandingRow>(LANDING_RESOURCE);
}

async function landingRows(): Promise<LandingRow[]> {
  const rows = await allRows();
  return rows.filter((row) => row.dashboard === LANDING_DASHBOARD).sort(byPosition);
}

function toEntry(row: LandingRow): AdminDashboardPlacement {
  return { id: row.id, widget: row.widget, size: row.size as AdminWidgetSize };
}

function toRow(entry: AdminDashboardPlacement, position: number): LandingRow {
  return {
    id: entry.id,
    dashboard: LANDING_DASHBOARD,
    widget: entry.widget,
    size: entry.size,
    position,
  };
}

let seeded: Promise<void> | null = null;

/**
 * Gives the page a starting arrangement the first time this process reads it.
 *
 * A visitor who lands on an empty editor concludes the demo is broken, which is the opposite of what
 * a demo is for. Memoised per process for the same reason the rest of the workspace seed is: deleting
 * every section and reloading keeps them deleted, and a restart brings the demo back to a state
 * worth looking at.
 */
function ensureLandingSeeded(): Promise<void> {
  seeded ??= (async () => {
    const existing = await landingRows();
    if (existing.length > 0) return;
    const adapter = demoPersistence().adapter;
    for (const [position, section] of seededSections.entries()) {
      await adapter.create(LANDING_RESOURCE, { ...section, dashboard: LANDING_DASHBOARD, position });
    }
  })().catch((cause: unknown) => {
    seeded = null;
    throw cause;
  });
  return seeded;
}

export async function readLandingSections(): Promise<AdminDashboardPlacement[]> {
  await canArrangeLanding();
  await ensureLandingSeeded();
  return (await landingRows()).map(toEntry);
}

/**
 * Replaces the arrangement with `sections`, as one write.
 *
 * Reconcile rather than one action per operation, because the editor reports the whole collection on
 * every change, so an add and a reorder are the same message by the time the host sees it. Only `id`,
 * `widget` and `size` are read off an entry, so a key the engine does not declare cannot be smuggled
 * into a row, and an unrecognised size is refused rather than stored for the database to reject.
 */
export async function saveLandingSections(sections: AdminDashboardPlacement[]): Promise<void> {
  await canArrangeLanding();
  await ensureLandingSeeded();

  if (!Array.isArray(sections)) {
    throw new Error("The landing page arrangement must be a list of sections");
  }
  if (sections.length > 200) {
    throw new Error("That is more sections than a landing page can hold");
  }

  const rows = await allRows();
  const owned = new Set(
    rows.filter((row) => row.dashboard === LANDING_DASHBOARD).map((row) => row.id),
  );
  // Ids are the table's primary key, so every row this page does not own is by definition an identity
  // belonging to somewhere else.
  const foreign = new Set(
    rows.filter((row) => !owned.has(row.id)).map((row) => row.id),
  );

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

    const widget = String(section.widget ?? "");
    const size = String(section.size ?? "");
    if (!adminWidgetSizes.includes(size as AdminWidgetSize)) {
      throw new Error(`"${size}" is not a section width`);
    }
    return { id, widget, size: size as AdminWidgetSize, position };
  });

  const adapter = demoPersistence().adapter;

  // Every row this page owns goes, and every wanted row is written back under its own identity.
  //
  // The table is unique on (dashboard, position), so a swap that updated one row at a time would move
  // a row onto a position another still holds and fail on the second row of every reorder. Clearing
  // first makes the write order irrelevant, and it means a row can only ever hold the columns built
  // here, so a key the browser attached to an entry cannot survive into a row it did not come from.
  // Every value is checked above before anything is deleted, so the only way to reach the writes is
  // with rows the database will accept.
  for (const row of rows) {
    if (owned.has(row.id)) {
      await adapter.delete(LANDING_RESOURCE, row.id);
    }
  }

  for (const entry of wanted) {
    await adapter.create(LANDING_RESOURCE, toRow(entry, entry.position));
  }
}
