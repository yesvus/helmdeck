// SPDX-License-Identifier: MIT
import type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminPersistenceAdapter,
} from "@yesvus/helmdeck";
import { revalidatePath } from "next/cache";
import { demoPersistence } from "./demo-persistence";
import { demoCacheRoutes } from "./demo-cache";

/**
 * The demo's audit trail, so the package's seam has a caller in the demo as well as in the package.
 *
 * A trail is a host table, not a package contract, and this writes to one directly rather than
 * through the resource actions. That is deliberate and it is the same choice `demo-revisions.ts`
 * makes: the actions audit the actions, so a trail written through them would record the trail's own
 * writes and never finish.
 *
 * It is not in `exposedResource`. A trail is not a table a browser browses, and `post_revisions` set
 * that precedent.
 */
const TABLE = "audit_events";

/**
 * One row per event, shaped like `0005_post_revisions.sql` beside it.
 *
 * `fields` holds the field **names** the record carried, never its values. A trail holding every
 * value a record has ever had is a second copy of every secret in the table, and the package's event
 * does not ask for values either.
 */
function toRow(event: AdminAuditEvent): Record<string, unknown> {
  const actor = event.actor;
  return {
    id: `aud_${event.occurredAt ?? "now"}_${event.action}_${event.resource}_${event.resourceId ?? "collection"}`,
    resource: event.resource,
    resource_id: event.resourceId ?? "",
    action: event.action,
    actor_email: actor?.email ?? "",
    actor_role: actor?.role ?? "",
    fields: JSON.stringify((event.metadata?.fields as string[] | undefined) ?? []),
    occurred_at: event.occurredAt ?? new Date().toISOString(),
  };
}

export function createDemoAuditAdapter(
  adapter: AdminPersistenceAdapter = demoPersistence().adapter,
  onError?: (cause: unknown) => void,
): AdminAuditAdapter {
  return {
    async record(event) {
      try {
        await adapter.create(TABLE, toRow(event));
      } catch (cause) {
        // The write already happened, and raising here would be an error on a save that worked. It is
        // reported rather than swallowed, because a trail that silently stopped being written is
        // worse than one that is visibly broken.
        onError?.(cause);
      }
    },
  };
}

/**
 * The demo's cache, over the same `revalidatePath` the arranger already uses.
 *
 * The mapping is the one place a host has to decide something the package cannot: which route a
 * resource is on. It is in its own module for that reason, and the two halves of a write are handled
 * by the package's seam rather than here.
 */
export function createDemoCacheAdapter(onError?: (cause: unknown) => void): AdminCacheInvalidationAdapter {
  return {
    async invalidate({ resource, resourceId }) {
      try {
        for (const route of demoCacheRoutes(resource, resourceId)) revalidatePath(route);
      } catch (cause) {
        onError?.(cause);
      }
    },
  };
}
