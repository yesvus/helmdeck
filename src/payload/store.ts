// SPDX-License-Identifier: MIT

import type { AdminPersistenceAdapter } from "../adapters/host.js";
import {
  ADMIN_RESOURCE_MAX_LIMIT,
  type AdminResourceFilter,
  type AdminResourcePage,
  type AdminResourceQuery,
  type AdminResourceSort,
} from "../adapters/query.js";
import type { AdminPayloadContent } from "./bridge.js";

/**
 * The resource store, over Payload.
 *
 * The store is the contract the package's own surfaces read through: the generated lists, the
 * analytics and the exports. This is that contract answered by Payload, so a host that has Payload
 * as its CMS does not write a second store that answers the same questions differently.
 *
 * Every call goes through the content module, so every call carries `overrideAccess: false` and the
 * session's user. A store that made its own calls would be a place where the access check could be
 * forgotten, and the one thing this package refuses to offer is a second way to read a record
 * without a rule behind it.
 */

/** The answer Payload's `find` gives. */
type AdminPayloadFindResult<T> = {
  docs?: T[];
  totalDocs?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
};

const OPERATOR_TO_WHERE: Record<
  AdminResourceFilter["operator"],
  (value: AdminResourceFilter["value"]) => Record<string, unknown>
> = {
  eq: (value) => ({ equals: value }),
  ne: (value) => ({ not_equals: value }),
  gt: (value) => ({ greater_than: value }),
  gte: (value) => ({ greater_than_equal: value }),
  lt: (value) => ({ less_than: value }),
  lte: (value) => ({ less_than_equal: value }),
  in: (value) => ({ in: value }),
  contains: (value) => ({ like: `%${String(value ?? "")}%` }),
  isNull: () => ({ exists: false }),
  notNull: () => ({ exists: true }),
};

function toWhere(
  resource: string,
  query: { search?: string; filter?: readonly AdminResourceFilter[] },
  searchFields?: string[] | ((resource: string) => string[] | undefined),
): Record<string, unknown> | undefined {
  const clauses: Record<string, unknown>[] = (query.filter ?? []).map((filter) => ({
    [filter.field]: OPERATOR_TO_WHERE[filter.operator](filter.value),
  }));
  const term = query.search?.trim();
  if (term) {
    const fields = typeof searchFields === "function" ? searchFields(resource) : searchFields;
    if (!fields || fields.length === 0) {
      throw new AdminPayloadSearchRefused(resource);
    }
    // `contains`, not `like`: the memory and sqlite stores answer a search with a literal
    // substring, and a term with % or _ in it stays a literal there.
    clauses.push({ or: fields.map((field) => ({ [field]: { contains: term } })) });
  }
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { and: clauses };
}

/** An exact-match map, the shape the credential store and a host's own code hand a store: each entry is an equality, not a part of the list query. */
function toEqualsWhere(map: Record<string, unknown>): Record<string, unknown> | undefined {
  const clauses = Object.entries(map).map(([field, value]) => ({ [field]: { equals: value } }));
  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];
  return { and: clauses };
}

function toSort(sort: readonly AdminResourceSort[] = []): string | undefined {
  if (sort.length === 0) return undefined;
  // Payload takes one ordering per field, in the order the fields are given, and a descending one
  // with a minus in front of it.
  return sort.map((entry) => (entry.direction === "desc" ? `-${entry.field}` : entry.field)).join(",");
}

/**
 * The page a window falls on, and the rows before it that the window skips.
 *
 * Payload pages by number and the store's window is an offset, so the two are only the same
 * question when the offset is a whole number of pages. An offset that is not is refused rather than
 * answered with the rows of a different window: a list that shows the wrong rows is not a small
 * mistake.
 */
function toPage(offset: number, limit: number): number {
  if (offset % limit !== 0) {
    throw new AdminPayloadWindowError(
      `A window that starts ${offset} rows in and asks for ${limit} rows does not start on a page boundary, and Payload pages by number rather than by offset.`,
    );
  }
  return Math.floor(offset / limit) + 1;
}

/** A window this store cannot answer, said plainly. */
export class AdminPayloadWindowError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AdminPayloadWindowError";
  }
}

export type AdminPayloadPersistenceOptions = {
  content: AdminPayloadContent;
  /**
   * The collection a resource is held in. A host with one collection per resource names them
   * here; a host with a single collection for everything gives the same name for every resource.
   */
  collection: string | ((resource: string) => string);
  /** The field the rows are ordered by when the query names no ordering. */
  defaultSort?: string;
  /**
   * The fields a resource's search box reads. A generated list asks the store for a search term,
   * and a structured store can only search fields it is told about, so a host names them here,
   * per resource. The term goes to Payload's `contains`, whose answer is the literal substring,
   * the answer the memory and sqlite stores give too. A search asked with no fields to read is
   * refused rather than answered with unsearched rows under a search box that looks like it
   * worked.
   */
  searchFields?: string[] | ((resource: string) => string[] | undefined);
};

/** A search this store was not given the fields to answer, said plainly. */
export class AdminPayloadSearchRefused extends Error {
  constructor(resource: string) {
    super(`the resource ${resource} asked for a search, and the store has no fields named to search it over. Name the resource's fields in the store's searchFields.`);
    this.name = "AdminPayloadSearchRefused";
  }
}

/** Payload's Local API reports a missing record with a not-found error; anything else is real. */
function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; status?: number };
  return e?.name === "NotFoundError" || e?.status === 404;
}

export function createAdminPayloadPersistenceAdapter({
  content,
  collection,
  defaultSort = "-createdAt",
  searchFields,
}: AdminPayloadPersistenceOptions): AdminPersistenceAdapter {
  const collectionFor = (resource: string) =>
    typeof collection === "function" ? collection(resource) : collection;

  const find = async <T,>(resource: string, query: AdminResourceQuery = {}, searchFields?: AdminPayloadPersistenceOptions["searchFields"]): Promise<{ rows: T[]; total: number }> => {
    const limit = Math.min(query.window?.limit ?? ADMIN_RESOURCE_MAX_LIMIT, ADMIN_RESOURCE_MAX_LIMIT);
    const offset = query.window?.offset ?? 0;
    const result = (await content.find(collectionFor(resource), {
      where: toWhere(resource, query, searchFields),
      sort: toSort(query.sort) ?? defaultSort,
      ...(query.window
        ? { limit, page: toPage(offset, limit) }
        // No window is a whole answer, as the memory adapter answers one: the runs that read
        // every row are not capped at the list's page size.
        : { pagination: false }),
    })) as AdminPayloadFindResult<T>;
    return { rows: result.docs ?? [], total: result.totalDocs ?? result.docs?.length ?? 0 };
  };

  return {
    read: async <T,>(resource: string, id: string): Promise<T | null> => {
      try {
        const found = (await content.findByID(collectionFor(resource), id)) as T | null;
        return found ?? null;
      } catch (error) {
        // A record that is not there is not an error, and Payload says so with a not-found error
        // rather than with an empty answer. A refusal or an outage is a real failure: reporting
        // it as not-found would tell a reader the record never existed.
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    // The exact-match map the credential store and a host's own code hand over: each entry an
    // equality on that field, as the memory store's query answers them. The list contract's
    // search, filter, sort and window live on `queryPage`; a column named one of those words
    // still matches exactly here.
    query: async <T,>(resource: string, query?: Record<string, unknown>): Promise<T[]> => {
      const result = (await content.find(collectionFor(resource), {
        where: toEqualsWhere(query ?? {}),
        sort: defaultSort,
        pagination: false,
      })) as AdminPayloadFindResult<T>;
      return result.docs ?? [];
    },
    queryPage: async <T,>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> => {
      const { rows, total } = await find<T>(resource, query, searchFields);
      return { rows, total };
    },
    create: async <T,>(resource: string, value: unknown): Promise<T> => {
      const created = await content.create(collectionFor(resource), value);
      return created as T;
    },
    update: async <T,>(resource: string, id: string, value: unknown): Promise<T> => {
      const updated = await content.update(collectionFor(resource), id, value);
      return updated as T;
    },
    delete: async (resource: string, id: string): Promise<void> => {
      await content.delete(collectionFor(resource), id);
    },
  };
}
