// SPDX-License-Identifier: MIT

import type { AdminAuditEvent } from "../adapters/host.js";
import type { AdminSession } from "../adapters/session.js";
import type { AdminActivityFilter } from "../activity/timeline.js";
import type { AdminPayloadContent } from "./bridge.js";

/**
 * The dashboard's tiles and the activity trail, over Payload.
 *
 * A tile loads its own data and a slow one affects only itself, so a tile's loader is a function
 * the host hands the dashboard. The same is true of the trail's filter, which is handed to the host
 * rather than applied in the browser. These are the loaders that make those two read Payload
 * through the one permission-checked call site.
 */

/** The answer Payload's `find` gives. */
type AdminPayloadFindResult<T> = {
  docs?: T[];
  totalDocs?: number;
};

export type AdminPayloadCountLoaderOptions = {
  content: AdminPayloadContent;
  collection: string;
  /** The condition the count is over. */
  where?: Record<string, unknown>;
};

/**
 * A loader that counts the records in a collection, which is what a dashboard tile usually shows.
 *
 * The count comes from the same answer as the rows would, so a tile that counts and a list that
 * shows the same collection cannot disagree about how many there are.
 */
export function createAdminPayloadCountLoader({
  content,
  collection,
  where,
}: AdminPayloadCountLoaderOptions): () => Promise<number> {
  return async () => {
    const result = (await content.find(collection, { where, limit: 1, page: 1 })) as AdminPayloadFindResult<unknown>;
    return result.totalDocs ?? result.docs?.length ?? 0;
  };
}

export type AdminPayloadRecordLoaderOptions<T> = {
  content: AdminPayloadContent;
  collection: string;
  where?: Record<string, unknown>;
  /** How a row becomes what the tile shows. */
  map?: (row: T) => unknown;
  limit?: number;
};

/** A loader that reads the records in a collection. */
export function createAdminPayloadRecordLoader<T>({
  content,
  collection,
  where,
  map,
  limit = 50,
}: AdminPayloadRecordLoaderOptions<T>): () => Promise<unknown[]> {
  return async () => {
    const result = (await content.find(collection, { where, limit, page: 1 })) as AdminPayloadFindResult<T>;
    const rows = result.docs ?? [];
    return map ? rows.map((row) => map(row)) : rows;
  };
}

/** The row the activity collection holds. */
export type AdminPayloadActivityRow = {
  id: string | number;
  action?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  actorId?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** The package's audit event, from a row in the activity collection. */
export function defaultAdminPayloadActivityEvent(row: AdminPayloadActivityRow): AdminAuditEvent {
  const actor: AdminSession | undefined = row.actorId ? { userId: row.actorId, email: row.actorId } : undefined;
  return {
    action: row.action ?? "",
    resource: row.resource ?? "",
    resourceId: row.resourceId ?? undefined,
    actor,
    occurredAt: row.occurredAt ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

export type AdminPayloadActivityLoaderOptions = {
  content: AdminPayloadContent;
  collection?: string;
  /** The field the moment of the event is held in. */
  occurredAtField?: string;
  /** The field the actor is held in. */
  actorField?: string;
  /** How a row becomes the event the trail shows. */
  mapEvent?: (row: AdminPayloadActivityRow) => AdminAuditEvent;
  /** How many events one read holds. */
  limit?: number;
};

/**
 * The trail's loader, over an activity collection.
 *
 * The filter is handed to the host rather than applied in the browser, because narrowing a page
 * after fetching all of it is not a filter. So the conditions are built here and the rows are read
 * through the one call site.
 */
export function createAdminPayloadActivityLoader({
  content,
  collection = "admin-activity",
  occurredAtField = "occurredAt",
  actorField = "actorId",
  mapEvent = defaultAdminPayloadActivityEvent,
  limit = 100,
}: AdminPayloadActivityLoaderOptions): (filter: AdminActivityFilter) => Promise<AdminAuditEvent[]> {
  return async (filter: AdminActivityFilter) => {
    const clauses: Record<string, unknown>[] = [];
    if (filter.action) clauses.push({ action: { equals: filter.action } });
    if (filter.actor) clauses.push({ [actorField]: { equals: filter.actor } });
    if (filter.from) clauses.push({ [occurredAtField]: { greater_than_equal: filter.from } });
    if (filter.to) clauses.push({ [occurredAtField]: { less_than_equal: filter.to } });

    const result = (await content.find(collection, {
      where: clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { and: clauses },
      sort: `-${occurredAtField}`,
      limit,
      page: 1,
    })) as AdminPayloadFindResult<AdminPayloadActivityRow>;

    return (result.docs ?? []).map((row) => mapEvent(row));
  };
}
