// SPDX-License-Identifier: MIT
import type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminPersistenceAdapter,
} from "../adapters/index.js";
import { parseAdminResourceQuery } from "../adapters/query.js";
import type {
  AdminResourceFilter,
  AdminResourcePage,
  AdminResourceQuery,
  AdminResourceSort,
} from "../adapters/query.js";

/** A stored record, with the identity the persistence layer needs to address it. */
export type MemoryRecord = { id: string; [key: string]: unknown };

/**
 * Where a stored value sits in an order: nothing first, then numbers and booleans, then text.
 *
 * This is SQLite's own order of storage classes, written out because the two stores shipped here
 * have to answer the same query the same way. A record that sorted differently under the two
 * adapters would move between pages, and a list cannot show its way out of a disagreement about
 * which row is the fortieth.
 */
function rankOf(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" || typeof value === "boolean") return 1;
  return 2;
}

/** A boolean as the number a database stores it as, so `true` and `1` order as each other. */
function asNumber(value: unknown): number {
  return typeof value === "boolean" ? (value ? 1 : 0) : Number(value);
}

/** Text a comparison reads, with a document spelled as its own JSON, which is how a store casts it. */
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function compareValues(left: unknown, right: unknown): number {
  const ranks = rankOf(left) - rankOf(right);
  if (ranks !== 0) return ranks;
  if (ranks === 0 && rankOf(left) === 0) return 0;
  if (rankOf(left) === 1) return asNumber(left) - asNumber(right);
  const leftText = asText(left);
  const rightText = asText(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

/** A value the search reads, or nothing for one it does not read: a null and a document. */
function searchable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  return String(value);
}

function matchesSearch(record: MemoryRecord, term: string): boolean {
  const needle = term.toLowerCase();
  return Object.values(record).some((value) => {
    const text = searchable(value);
    return text !== null && text.toLowerCase().includes(needle);
  });
}

function containsTerm(value: unknown, term: string): boolean {
  if (value === null || value === undefined) return false;
  return asText(value).toLowerCase().includes(term.toLowerCase());
}

/** `===` for equality, because the exact-match reading of the older query depends on it. */
function matches(record: MemoryRecord, filter: AdminResourceFilter): boolean {
  const value = record[filter.field];
  switch (filter.operator) {
    case "eq":
      return value === filter.value;
    case "ne":
      return value !== filter.value;
    case "gt":
      return compareValues(value, filter.value) > 0;
    case "gte":
      return compareValues(value, filter.value) >= 0;
    case "lt":
      return compareValues(value, filter.value) < 0;
    case "lte":
      return compareValues(value, filter.value) <= 0;
    case "in":
      return (filter.value as unknown[]).some((entry) => value === entry);
    case "contains":
      return containsTerm(value, filter.value as string);
    case "isNull":
      return value === null;
    case "notNull":
      return value !== null && value !== undefined;
  }
}

/**
 * The store's own order when nothing is asked for, and the asked-for order with the id behind it.
 *
 * The id is the tiebreak because it is the one field every record here has, the one a list
 * addresses its rows by, and the one field a page boundary can be stated in terms of. Without it,
 * which row of a group tied on the sort field lands on which page is left to the engine, and two
 * pages of one query can then repeat a row and drop another. It goes last and always ascending,
 * so it settles ties without ever contradicting the order that was asked for.
 */
function orderRecords(records: MemoryRecord[], sort: AdminResourceSort[] | undefined): MemoryRecord[] {
  if (sort === undefined || sort.length === 0) return records;
  const keys: AdminResourceSort[] = [...sort, { field: "id", direction: "asc" }];
  return [...records].sort((left, right) => {
    for (const key of keys) {
      const compared = compareValues(left[key.field], right[key.field]);
      if (compared !== 0) return key.direction === "desc" ? -compared : compared;
    }
    return 0;
  });
}

/**
 * CRUD over plain objects, held in memory. For fixtures, tests and demos, so a host can run
 * the whole admin without a database.
 *
 * Every method is a copy in and a copy out. A caller mutating what it was handed would
 * otherwise be editing stored state without going through `update`, which no invalidation
 * ever sees.
 *
 * `query` matches a map of exact values, which is what every adapter in this repository has
 * always meant by a query. `queryPage` is the other form: a term to look for, comparisons, an
 * ordering and a window, with the count of what matched before the window.
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

  // Skips ids already in use, so generating one cannot collide with a record seeded under an id
  // of its own.
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

    // Read through the parser first, because it is the authority on what a query is and a hand-built
    // object typed as one compiles whether or not its operator is real.
    async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
      const asked = parseAdminResourceQuery(query);
      const records = store.get(resource) ?? [];
      const matched = records.filter(
        (record) =>
          (asked.search === undefined || matchesSearch(record, asked.search)) &&
          (asked.filter ?? []).every((filter) => matches(record, filter)),
      );
      const ordered = orderRecords(matched, asked.sort);
      // Counted before the window, which is what makes a page a page: how many records the query
      // matched, and which slice of them this is. A count taken from the rows would be the length of
      // the page, and a list would then offer a hundred empty pages of a store it had not counted.
      const total = ordered.length;
      const rows = asked.window
        ? ordered.slice(asked.window.offset, asked.window.offset + asked.window.limit)
        : ordered;
      return { rows: rows.map(clone) as T[], total };
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      const supplied = (value as Record<string, unknown>).id;
      // An id the caller chose is kept, so a seeded row stays addressable by the id the seed
      // knows. Generating one instead renumbers it, and a second seed pass then cannot find the
      // first pass's rows, so it writes them again: a store documented as idempotent grows on
      // every run while nothing about it looks wrong from outside.
      const id =
        supplied === undefined || supplied === null || supplied === "" ? nextId() : String(supplied);

      const records = recordsFor(resource);
      if (records.some((record) => record.id === id)) {
        throw new Error(`A ${resource} record with id ${id} already exists`);
      }

      const record = { ...clone(value as Record<string, unknown>), id };
      records.push(record);
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
