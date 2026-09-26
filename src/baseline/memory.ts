// SPDX-License-Identifier: MIT
import type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminPersistenceAdapter,
} from "../adapters/index.js";

/** A stored record, with the identity the persistence layer needs to address it. */
export type MemoryRecord = { id: string; [key: string]: unknown };

/**
 * CRUD over plain objects, held in memory. For fixtures, tests and demos, so a host can run
 * the whole admin without a database.
 *
 * Every method is a copy in and a copy out. A caller mutating what it was handed would
 * otherwise be editing stored state without going through `update`, which no invalidation
 * ever sees.
 */
export function createMemoryPersistenceAdapter(seed: Record<string, MemoryRecord[]> = {}): AdminPersistenceAdapter & {
  /** Replaces the contents of a resource outright, for test setup and fixtures. */
  reset: (resource: string, records: MemoryRecord[]) => void;
  /** Every stored record for a resource, as a copy. */
  dump: (resource: string) => MemoryRecord[];
  /** Drops a resource entirely. */
  clear: () => void;
} {
  const store = new Map<string, MemoryRecord[]>();
  let sequence = 0;
  for (const [resource, records] of Object.entries(seed)) {
    store.set(resource, records.map(clone));
  }

  function read(resource: string, id: string): MemoryRecord | null {
    const found = store.get(resource)?.find((record) => record.id === id);
    return found ? clone(found) : null;
  }

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  // Skips ids already in use, so seeding or resetting with an id cannot produce a second
  // record the CRUD helpers cannot tell apart.
  function nextId(): string {
    const taken = new Set(Array.from(store.values()).flat().map((record) => record.id));
    for (;;) {
      sequence += 1;
      const candidate = `mem_${sequence}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  function recordsFor(name: string): MemoryRecord[] {
    const existing = store.get(name);
    if (existing) return existing;
    const created: MemoryRecord[] = [];
    store.set(name, created);
    return created;
  }

  return {
    async read<T>(resource: string, id: string): Promise<T | null> {
      return read(resource, id) as T | null;
    },

    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      const records = store.get(resource) ?? [];
      const matched = query
        ? records.filter((record) =>
            Object.entries(query).every(([key, value]) => record[key] === value),
          )
        : records;
      return matched.map(clone) as T[];
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      const record = { ...clone(value as Record<string, unknown>), id: nextId() };
      recordsFor(resource).push(record);
      return clone(record) as T;
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      const records = recordsFor(resource);
      const index = records.findIndex((record) => record.id === id);
      if (index === -1) {
        throw new Error(`No ${resource} record with id ${id}`);
      }
      // The id is the record's identity, so an update cannot move it.
      const updated = { ...clone(value as Record<string, unknown>), id };
      records[index] = updated;
      return clone(updated) as T;
    },

    async delete(resource: string, id: string): Promise<void> {
      const records = store.get(resource);
      if (!records) return;
      const index = records.findIndex((record) => record.id === id);
      if (index !== -1) records.splice(index, 1);
    },

    reset(name: string, records: MemoryRecord[]) {
      store.set(name, records.map(clone));
    },

    dump(name: string) {
      return (store.get(name) ?? []).map(clone);
    },

    clear() {
      store.clear();
    },
  };
}

/**
 * Records audit events to a sink the host supplies. Failures are swallowed on purpose: a
 * logging problem must not roll back the change the visitor actually made, and a rejected
 * promise here would surface as an error on an action that already succeeded.
 */
export function createAuditAdapter({
  sink,
  onError,
}: {
  sink: (event: AdminAuditEvent) => void | Promise<void>;
  onError?: (cause: unknown, event: AdminAuditEvent) => void;
}): AdminAuditAdapter {
  return {
    async record(event: AdminAuditEvent) {
      try {
        await sink(event);
      } catch (cause) {
        onError?.(cause, event);
      }
    },
  };
}

/**
 * Cache invalidation with the common case already handled: one call that clears a resource,
 * and one that also names the record. Keys are collected before awaiting so a rejected
 * `invalidate` cannot leave a later one unrun.
 */
export function createCacheAdapter({
  invalidate,
  onError,
}: {
  invalidate: (keys: string[]) => void | Promise<void>;
  onError?: (cause: unknown, keys: string[]) => void;
}): AdminCacheInvalidationAdapter {
  return {
    async invalidate({ resource, resourceId }) {
      const keys = resourceId === undefined ? [resource] : [`${resource}:${resourceId}`];
      try {
        await invalidate(keys);
      } catch (cause) {
        onError?.(cause, keys);
      }
    },
  };
}
