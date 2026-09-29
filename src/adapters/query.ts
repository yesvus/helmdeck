// SPDX-License-Identifier: MIT

/** How a filter compares one field against a value. A host maps these onto its own store. */
export type AdminResourceFilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains"
  | "isNull"
  | "notNull";

export type AdminResourceFilterValue = string | number | boolean | null;

export type AdminResourceFilter = {
  field: string;
  operator: AdminResourceFilterOperator;
  /** Absent for `isNull` and `notNull`, which are the whole comparison. */
  value?: AdminResourceFilterValue | AdminResourceFilterValue[];
};

export type AdminResourceSort = {
  field: string;
  direction: "asc" | "desc";
};

/** Which slice of the matched set to return. A host maps this onto its own limit and offset. */
export type AdminResourceWindow = {
  offset: number;
  limit: number;
};

/**
 * What a list is asking for: which records, in what order, and how many of them are there.
 *
 * Every part is optional, and an absent part means the host's own default rather than an empty
 * one, so a host can answer a paged query and a bare one from the same code path.
 */
export type AdminResourceQuery = {
  search?: string;
  filter?: AdminResourceFilter[];
  sort?: AdminResourceSort[];
  window?: AdminResourceWindow;
};

/** A window's worth of rows, and how many records the same query matched before the window. */
export type AdminResourcePage<T> = {
  rows: T[];
  total: number;
};

/**
 * The largest window a query may ask for.
 *
 * A limit is a claim about what the store can serve, and the number this contract exists to stop
 * is a list asking for everything. A store that cannot honour a limit of 40 has a problem a
 * larger cap here would only hide.
 */
export const ADMIN_RESOURCE_MAX_LIMIT = 1000;

/** Longer than this is a term no list view search box produces, and a payload a store should not be handed. */
const MAX_SEARCH = 200;

const QUERY_PARTS = new Set(["search", "filter", "sort", "window"]);
const WINDOW_PARTS = new Set(["offset", "limit"]);
const OPERATORS = new Set<AdminResourceFilterOperator>([
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "isNull",
  "notNull",
]);
const NULLARY = new Set<AdminResourceFilterOperator>(["isNull", "notNull"]);
const DIRECTIONS = new Set(["asc", "desc"]);

/**
 * A field name, or identifiers joined by dots for a nested value.
 *
 * A field name crosses a boundary on its way to a store, and a store is where a field name tends
 * to be concatenated into a statement. Restricting the shape here means a host never has to ask
 * whether the name it was handed is a name.
 */
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export function isAdminResourceField(value: unknown): value is string {
  return typeof value === "string" && FIELD_PATH.test(value);
}

/** A query this package will not build, read or forward. */
export class AdminResourceQueryError extends Error {
  constructor(reason: string) {
    super(`That resource query cannot be used: ${reason}`);
    this.name = "AdminResourceQueryError";
  }
}

function refuse(reason: string): never {
  throw new AdminResourceQueryError(reason);
}

function objectAt(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    refuse(`${what} is an object.`);
  }
  return value as Record<string, unknown>;
}

function fieldAt(value: unknown, what: string): string {
  if (!isAdminResourceField(value)) {
    refuse(
      `${what} names ${JSON.stringify(value)}, which is not a field. A field is one identifier, ` +
        "or identifiers joined by dots.",
    );
  }
  return value;
}

function scalarAt(value: unknown, what: string): AdminResourceFilterValue {
  if (typeof value === "number" && !Number.isFinite(value)) {
    refuse(`${what} is ${String(value)}, which is not a number a store can compare against.`);
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
    refuse(`${what} is a string, a number, a boolean or null.`);
  }
  return value;
}

function filterValueAt(
  value: unknown,
  operator: AdminResourceFilterOperator,
  what: string,
): AdminResourceFilter["value"] {
  if (Array.isArray(value)) {
    if (operator !== "in") {
      refuse(`${what} is a list, which only "in" compares against.`);
    }
    if (value.length === 0) {
      refuse(`${what} is an empty list, which matches nothing rather than everything.`);
    }
    return value.map((entry, index) => scalarAt(entry, `${what} entry ${index}`));
  }
  return scalarAt(value, what);
}

function parseFilter(entry: unknown, index: number, seen: Set<string>): AdminResourceFilter {
  const input = objectAt(entry, `filter ${index}`);
  const field = fieldAt(input.field, `filter ${index}`);
  const operator = input.operator;
  if (typeof operator !== "string" || !OPERATORS.has(operator as AdminResourceFilterOperator)) {
    refuse(`filter ${index} compares with ${JSON.stringify(operator)}, which is not a comparison.`);
  }
  const named = operator as AdminResourceFilterOperator;
  // Two of the same comparison on one field can only mean the caller lost track of which one was
  // meant, and the second would be the one a store drops without saying so.
  if (seen.has(`${field} ${named}`)) {
    refuse(`filter ${index} repeats ${field} ${named}.`);
  }
  seen.add(`${field} ${named}`);

  if (NULLARY.has(named)) {
    if (input.value !== undefined) {
      refuse(`${field} ${named} is the whole comparison, so it takes no value.`);
    }
    return { field, operator: named };
  }
  if (input.value === undefined) {
    refuse(`${field} ${named} needs a value.`);
  }
  return { field, operator: named, value: filterValueAt(input.value, named, `${field} ${named}`) };
}

function parseSort(entry: unknown, index: number, seen: Set<string>): AdminResourceSort {
  const input = objectAt(entry, `sort ${index}`);
  const field = fieldAt(input.field, `sort ${index}`);
  if (typeof input.direction !== "string" || !DIRECTIONS.has(input.direction)) {
    refuse(`sort ${index} orders ${field} by ${JSON.stringify(input.direction)}, which is not "asc" or "desc".`);
  }
  if (seen.has(field)) {
    refuse(`sort ${index} orders ${field} a second time, so the second ordering is the one a store drops.`);
  }
  seen.add(field);
  return { field, direction: input.direction as AdminResourceSort["direction"] };
}

function parseWindow(value: unknown): AdminResourceWindow {
  const input = objectAt(value, "window");
  const extra = Object.keys(input).find((key) => !WINDOW_PARTS.has(key));
  if (extra !== undefined) {
    refuse(`window has no "${extra}" part. A window is an offset and a limit.`);
  }
  if (!Number.isSafeInteger(input.offset) || (input.offset as number) < 0) {
    refuse(`window offset is ${JSON.stringify(input.offset)}, which is not a whole number from zero up.`);
  }
  if (!Number.isSafeInteger(input.limit) || (input.limit as number) < 1) {
    refuse(`window limit is ${JSON.stringify(input.limit)}, which is not a whole number from one up.`);
  }
  if ((input.limit as number) > ADMIN_RESOURCE_MAX_LIMIT) {
    refuse(`window limit is ${input.limit}, above the ${ADMIN_RESOURCE_MAX_LIMIT} this contract allows.`);
  }
  return { offset: input.offset as number, limit: input.limit as number };
}

/**
 * Reads an untrusted query as the one this contract describes, or refuses it.
 *
 * A query reaches a store from a browser as an object a caller chose, and the previous contract
 * took that object as a map of fields to exact values. Every adapter in this repository read it
 * that way, so a `sort` was a column named sort and a `limit` was a filter nothing matched: a
 * paging request silently became an empty list, and no adapter could tell the difference between
 * a caller who meant it and a caller who guessed. Refusing a part that is not part of the query
 * is what keeps the guess from reaching the store at all.
 *
 * Absent means absent rather than empty, so a caller that asked for nothing is handed nothing.
 */
export function parseAdminResourceQuery(value: unknown): AdminResourceQuery {
  if (value === undefined || value === null) return {};
  const input = objectAt(value, "a resource query");
  const extra = Object.keys(input).find((key) => !QUERY_PARTS.has(key));
  if (extra !== undefined) {
    refuse(
      `it has no "${extra}" part. A query is made of search, filter, sort and window, and nothing else.`,
    );
  }

  const query: AdminResourceQuery = {};

  if (input.search !== undefined) {
    if (typeof input.search !== "string") {
      refuse(`search is ${typeof input.search}, which is not a string.`);
    }
    if (input.search.length > MAX_SEARCH) {
      refuse(`search is ${input.search.length} characters, above the ${MAX_SEARCH} allowed.`);
    }
    // Whitespace is what an empty box holds, and a term of whitespace matches nothing a store
    // can be asked for.
    const term = input.search.trim();
    if (term.length > 0) query.search = term;
  }

  if (input.filter !== undefined) {
    if (!Array.isArray(input.filter)) {
      refuse(`filter is ${typeof input.filter}, which is not a list of comparisons.`);
    }
    const seen = new Set<string>();
    const filters = input.filter.map((entry, index) => parseFilter(entry, index, seen));
    if (filters.length > 0) query.filter = filters;
  }

  if (input.sort !== undefined) {
    if (!Array.isArray(input.sort)) {
      refuse(`sort is ${typeof input.sort}, which is not a list of orderings.`);
    }
    const seen = new Set<string>();
    const orderings = input.sort.map((entry, index) => parseSort(entry, index, seen));
    if (orderings.length > 0) query.sort = orderings;
  }

  if (input.window !== undefined) {
    query.window = parseWindow(input.window);
  }

  return query;
}

export type AdminResourceQueryBuilder = {
  search: (term: string) => AdminResourceQueryBuilder;
  where: (
    field: string,
    operator: AdminResourceFilterOperator,
    value?: AdminResourceFilterValue | AdminResourceFilterValue[],
  ) => AdminResourceQueryBuilder;
  sort: (field: string, direction: AdminResourceSort["direction"]) => AdminResourceQueryBuilder;
  window: (offset: number, limit: number) => AdminResourceQueryBuilder;
  build: () => AdminResourceQuery;
};

/**
 * Builds a query, and refuses the same parts `parseAdminResourceQuery` refuses.
 *
 * The builder is a convenience over plain data, not a different kind of query: what it returns is
 * what crosses a wire, so it can be read back through the parser, and a host writing a query by
 * hand gets the same refusal a chained one would.
 */
export function adminResourceQuery(init?: AdminResourceQuery): AdminResourceQueryBuilder {
  // A fresh object per call, so a query already handed to an adapter cannot be changed by a
  // later link in the chain.
  let query = parseAdminResourceQuery(init);
  const builder: AdminResourceQueryBuilder = {
    search(term) {
      const next = { ...query };
      const trimmed = term.trim();
      if (trimmed.length === 0) delete next.search;
      else next.search = trimmed;
      query = next;
      return builder;
    },
    where(field, operator, value) {
      const entry: AdminResourceFilter = value === undefined ? { field, operator } : { field, operator, value };
      query = { ...query, filter: [...(query.filter ?? []), entry] };
      return builder;
    },
    sort(field, direction) {
      query = { ...query, sort: [...(query.sort ?? []), { field, direction }] };
      return builder;
    },
    window(offset, limit) {
      query = { ...query, window: { offset, limit } };
      return builder;
    },
    build() {
      return parseAdminResourceQuery(query);
    },
  };
  return builder;
}
