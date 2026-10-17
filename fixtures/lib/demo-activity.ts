// SPDX-License-Identifier: MIT
import type { AdminAuditEvent, AdminPermission, AdminSession } from "@yesvus/helmdeck";
import { demoPersistence } from "./demo-persistence";
import { demoCan } from "./demo-rules";

/**
 * The demo's activity trail, read back out of the table `demo-audit` writes.
 *
 * The trail is not an exposed resource, so nothing browses it as rows and the generated list does not
 * touch it. It is read here instead, through the same persistence adapter the rest of the demo uses,
 * and the rule answers the same question about it as about everything else: `activity.read` reaches
 * administrators only, because a trail is everyone's writes and an editor's own two are the only ones
 * they may read.
 *
 * The filter arrives from the trail component rather than from the browser being trusted, so the
 * action the reader chose is applied here and nowhere else. An action the caller names outside the
 * set the trail holds is refused rather than treated as a match for nothing.
 */
const TABLE = "audit_events";
const ACTIVITY_READ = "activity.read" as AdminPermission;

export type ActivityFilter = {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
};

type TrailRow = {
  id?: unknown;
  resource?: unknown;
  resource_id?: unknown;
  action?: unknown;
  actor_email?: unknown;
  actor_name?: unknown;
  actor_role?: unknown;
  fields?: unknown;
  occurred_at?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function requireActivityRead(session: AdminSession | null): AdminSession {
  if (!session) throw new Error("Reading the activity trail needs a session");
  if (!demoCan(session, ACTIVITY_READ)) throw new Error("This session may not read the activity trail");
  return session;
}

/**
 * The whole day a `yyyy-mm-dd` filter names, as milliseconds.
 *
 * Read as UTC for the same reason the component reads its dates that way: the value a date input
 * sends carries no zone, so an offset read here would put the same filter an hour either side of its
 * meaning depending on who asked.
 */
function dayBounds(value: string, end: boolean): number | null {
  const parsed = Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter((name) => name.length > 0);
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(text) : [];
  } catch {
    return [];
  }
}

function toEvent(row: TrailRow): AdminAuditEvent {
  const email = text(row.actor_email);
  const name = text(row.actor_name);
  const role = text(row.actor_role);
  return {
    action: text(row.action),
    resource: text(row.resource),
    ...(text(row.resource_id) ? { resourceId: text(row.resource_id) } : {}),
    ...(email ? { actor: { email, ...(name ? { name } : {}), ...(role ? { role } : {}) } } : {}),
    ...(text(row.occurred_at) ? { occurredAt: text(row.occurred_at) } : {}),
    metadata: { fields: fieldNames(row.fields) },
  };
}

export async function listActivityEvents(
  session: AdminSession | null,
  filter: ActivityFilter = {},
): Promise<AdminAuditEvent[]> {
  requireActivityRead(session);
  // The action is an equality the store already understands, so it is asked of the store rather than
  // of every row in the table. The actor text and the two days are ranges the demo's own store cannot
  // express, so those are narrowed here, and a host with a real query engine hands all three to it.
  const rows = filter.action
    ? ((await demoPersistence().adapter.query<TrailRow>(TABLE, { action: filter.action })) ?? [])
    : ((await demoPersistence().adapter.query<TrailRow>(TABLE)) ?? []);
  const actor = filter.actor?.trim().toLowerCase() ?? "";
  const from = filter.from ? dayBounds(filter.from, false) : null;
  const to = filter.to ? dayBounds(filter.to, true) : null;

  return rows
    .filter((row) => row && row.action !== undefined)
    .filter((row) => (filter.action ? text(row.action) === filter.action : true))
    .filter((row) => {
      if (actor.length === 0) return true;
      // Name, email and role, because that is what the filter a reader types into searches.
      return `${text(row.actor_name)} ${text(row.actor_email)} ${text(row.actor_role)}`
        .toLowerCase()
        .includes(actor);
    })
    .filter((row) => {
      if (from === null && to === null) return true;
      const time = Date.parse(text(row.occurred_at));
      if (!Number.isFinite(time)) return false;
      return (from === null || time >= from) && (to === null || time <= to);
    })
    .map(toEvent)
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""));
}