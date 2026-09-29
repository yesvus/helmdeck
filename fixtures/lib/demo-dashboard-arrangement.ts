// SPDX-License-Identifier: MIT
"use server";

/**
 * The dashboard's arrangement, read from the store and written back through it.
 *
 * `0001_initial.sql` declares `dashboard_placements` so a saved dashboard is durable rather than a
 * constant compiled into a component, and this is the module that makes the table the arrangement.
 * It is read here rather than through the generic resource actions because an arrangement is an
 * ordered list: `position` is what holds the order, and a table browser that lists rows by id cannot
 * express a move. What the write path shares with the resource actions is the discipline around it: a
 * session, a role read off the stored user row, and a refusal before any row is written.
 *
 * A placement naming a widget this build does not register is refused on the way in and reported on
 * the way out. The registry decides, so the arranger and the grid cannot disagree about which
 * widgets exist, and a saved arrangement cannot manufacture the problem the grid then reports.
 */

import { revalidatePath } from "next/cache";
import {
  adminDashboardValidate,
  type AdminDashboard,
  type AdminDashboardPlacement,
  type AdminPermission,
  type AdminSession,
  type AdminWidgetSize,
} from "@yesvus/helmdeck";
import { dashboardRegistry } from "../app/dashboard/registry";
import { requireDemoSession } from "./demo-guard";
import { demoCan } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
import { ensureDemoSeeded } from "./ensure-seeded";

/** The one table the arrangement lives in, so no caller can aim these actions at another one. */
const RESOURCE = "dashboard_placements";

/** Where the session is sent back to, which is the route that shows what the arrangement renders. */
const ROUTE = "/dashboard";

type Operation = "read" | "create" | "update" | "delete";

/** One placement as the arranger holds it, and as it arrives from the browser. */
export type DashboardArrangementEntry = { id: string; widget: string; size: AdminWidgetSize };

type PlacementRow = { id: string; dashboard: unknown; widget: unknown; size: unknown; position: unknown };

/**
 * What the role on the session is worth over the arrangement.
 *
 * `dashboard_placements` is not in the demo's exposed resource set, so `demoCan` refuses that name
 * for every role, the administrator included. The arrangement is not one of the pages reserved to
 * administrators, so the role half of the question is the one the catalogue already answers: an
 * editor arranges content, and only an administrator removes a row. Asking it about a resource the
 * rule does expose keeps one rule answering rather than a second table of roles to drift from it.
 */
function canArrange(session: AdminSession, operation: Operation): boolean {
  return demoCan(session, `products.${operation}` as AdminPermission);
}

async function withArrangement(operation: Operation): Promise<AdminSession> {
  const session = await requireDemoSession({ returnTo: ROUTE });
  if (!canArrange(session, operation)) {
    throw new Error(`This session may not ${operation} ${RESOURCE}`);
  }
  // Before any read, so the first request of a cold process finds the arrangement rather than an
  // empty dashboard, and memoised inside, so it costs nothing after that.
  await ensureDemoSeeded();
  return session;
}

/** Every row of the table, not only this dashboard's, so an id claimed from elsewhere is caught. */
async function allRows(): Promise<PlacementRow[]> {
  return (await demoPersistence().adapter.query(RESOURCE)) as PlacementRow[];
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * A row as a placement, keeping whatever widget and size the store holds.
 *
 * A row the registry cannot render is still a placement: it has an id, so the grid can report it
 * beside the other tiles instead of the dashboard quietly losing one. A row with no usable id is not
 * addressable at all, so there is nothing to report it against and nothing a reorder could move.
 */
function toPlacement(row: PlacementRow): AdminDashboardPlacement | null {
  if (!isId(row.id)) return null;
  return {
    id: row.id,
    widget: typeof row.widget === "string" ? row.widget : "",
    size: (typeof row.size === "string" ? row.size : "") as AdminWidgetSize,
  };
}

/**
 * The order the rows are in, which is the order the table stores.
 *
 * A row whose position is not a whole number sorts after the ones that are, by id, so a position
 * written by something other than this module costs the dashboard one tile at the end of the grid
 * rather than every tile at once.
 */
function byPosition(left: PlacementRow, right: PlacementRow): number {
  const leftPosition = Number(left.position);
  const rightPosition = Number(right.position);
  const leftAt = Number.isInteger(leftPosition) ? leftPosition : Number.NaN;
  const rightAt = Number.isInteger(rightPosition) ? rightPosition : Number.NaN;
  if (Number.isNaN(leftAt) && Number.isNaN(rightAt)) return String(left.id).localeCompare(String(right.id));
  if (Number.isNaN(leftAt)) return 1;
  if (Number.isNaN(rightAt)) return -1;
  return leftAt - rightAt;
}

function arrangementFrom(name: string, rows: readonly PlacementRow[]): AdminDashboard {
  return {
    name,
    placements: rows
      .filter((row) => row.dashboard === name)
      .sort(byPosition)
      .map(toPlacement)
      .filter((placement): placement is AdminDashboardPlacement => placement !== null),
  };
}

/** The saved arrangement for one dashboard, as the rows hold it. */
export async function loadDashboardArrangementAction(dashboard: string): Promise<AdminDashboard> {
  await withArrangement("read");
  return arrangementFrom(dashboard, await allRows());
}

/**
 * The submitted list, checked before anything is written.
 *
 * Every entry needs an identity, because a placement the server names for itself could not be
 * reordered by the editor that holds it, and the next save would insert a second row for the same
 * tile. Two entries sharing one id are refused for the same reason: the second would overwrite the
 * first, and the person who dragged one of them would watch the other move.
 */
function checkedEntries(entries: readonly DashboardArrangementEntry[]): DashboardArrangementEntry[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isId(entry?.id) || typeof entry.widget !== "string" || typeof entry.size !== "string") {
      throw new Error("A placement needs an id, a widget and a size");
    }
    if (seen.has(entry.id)) throw new Error(`Two placements in this arrangement share the id ${entry.id}`);
    seen.add(entry.id);
  }
  return [...entries];
}

/**
 * The arrangement as the store will hold it, or a refusal naming what this build cannot render.
 *
 * The whole save is refused rather than the offending placement: persisting half of an arrangement
 * leaves a dashboard whose order and whose contents disagree, and there is no way to tell from the
 * grid which half was meant.
 */
function checkedArrangement(dashboard: string, entries: readonly DashboardArrangementEntry[]): AdminDashboard {
  const arrangement: AdminDashboard = {
    name: dashboard,
    placements: entries.map((entry) => ({ id: entry.id, widget: entry.widget, size: entry.size })),
  };
  const problems = adminDashboardValidate(dashboardRegistry, arrangement.placements);
  if (problems.size > 0) {
    const named = [...problems]
      .map(([id, messages]) => `${id}: ${messages.join(" ")}`)
      .join("; ");
    throw new Error(`This arrangement cannot be saved: ${named}`);
  }
  return arrangement;
}

/**
 * Saves the whole arrangement and answers with what the store now holds.
 *
 * A whole list rather than one row at a time, because order and membership are the same fact: a
 * resize that also drops a tile cannot be expressed as an update plus a delete that a partial
 * failure could separate. Answering with the arrangement rather than a count keeps the editor's
 * copy of it equal to the store's, which is what makes the next save mean the same thing.
 *
 * Positions are written in two passes because the table is unique on `(dashboard, position)`. Every
 * row is parked at a negative position first, which no row of this dashboard holds, and only then do
 * the final positions go in ascending order, so no write ever lands on a position another row still
 * has. Parking is not a state a visitor can see: the next read sorts on the final positions, and a
 * call that failed part-way leaves the rows it reached at the end of the grid rather than a
 * dashboard that quietly reordered itself.
 */
export async function saveDashboardArrangementAction(
  dashboard: string,
  entries: readonly DashboardArrangementEntry[],
): Promise<AdminDashboard> {
  const session = await withArrangement("read");
  const submitted = checkedEntries(entries);
  const arrangement = checkedArrangement(dashboard, submitted);

  const rows = await allRows();
  const owners = new Map(rows.filter((row) => isId(row.id)).map((row) => [String(row.id), row.dashboard]));
  for (const entry of submitted) {
    const owner = owners.get(entry.id);
    if (owner !== undefined && owner !== dashboard) {
      throw new Error(`Placement ${entry.id} belongs to another dashboard`);
    }
  }

  const current = rows.filter((row) => row.dashboard === dashboard);
  const currentIds = new Set(current.filter((row) => isId(row.id)).map((row) => String(row.id)));
  const wanted = new Set(arrangement.placements.map((placement) => placement.id));
  const removed = current.filter((row) => isId(row.id) && !wanted.has(String(row.id)));
  const added = arrangement.placements.filter((placement) => !currentIds.has(placement.id));
  const kept = arrangement.placements.filter((placement) => currentIds.has(placement.id));

  // Every operation the save is about to perform, asked before the first write, so a session that
  // may not do one of them leaves the arrangement exactly as it found it.
  const required: Operation[] = ["update"];
  if (added.length > 0) required.push("create");
  if (removed.length > 0) required.push("delete");
  for (const operation of required) {
    if (!canArrange(session, operation)) {
      throw new Error(`This session may not ${operation} ${RESOURCE}`);
    }
  }

  const adapter = demoPersistence().adapter;
  for (const [index, row] of kept.entries()) {
    await adapter.update(RESOURCE, row.id, { dashboard, widget: row.widget, size: row.size, position: -1 - index });
  }
  for (const row of removed) {
    if (isId(row.id)) await adapter.delete(RESOURCE, row.id);
  }
  for (const [index, placement] of added.entries()) {
    await adapter.create(RESOURCE, {
      id: placement.id,
      dashboard,
      widget: placement.widget,
      size: placement.size,
      position: -1 - kept.length - index,
    });
  }
  for (const [position, placement] of arrangement.placements.entries()) {
    await adapter.update(RESOURCE, placement.id, {
      dashboard,
      widget: placement.widget,
      size: placement.size,
      position,
    });
  }

  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/arrange`);
  return arrangementFrom(dashboard, await allRows());
}
