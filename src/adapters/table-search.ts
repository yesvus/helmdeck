// SPDX-License-Identifier: MIT

/**
 * A server-driven table's state, bound to the URL.
 *
 * A host that drives a table from the server keeps pagination, sorting, search and filters in the
 * query string so a view can be shared, refreshed and navigated with the browser. This adapter is the
 * typed bridge between that state and a `URLSearchParams`: it parses one into the other and back,
 * with defaults for every concern and a per-key override for the ones a host names differently.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGE_SIZE = 1000;
const DEFAULT_MAX_SEARCH = 200;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export type AdminTableSearchDirection = "asc" | "desc";

export type AdminTableSearchSort = {
  field: string;
  direction: AdminTableSearchDirection;
};

export type AdminTableSearchFilters = Record<string, string[]>;

export type AdminTableSearchState = {
  page: number;
  pageSize: number;
  sort: AdminTableSearchSort | null;
  search: string;
  filters: AdminTableSearchFilters;
};

export type AdminTableSearchKeyMap = {
  page?: string;
  pageSize?: string;
  sort?: string;
  search?: string;
  sortField?: string;
  sortDirection?: string;
};

export type AdminTableSearchDefaults = Partial<AdminTableSearchState>;

export type AdminTableSearchConcernOverride = {
  key?: string;
  default?: unknown;
  parse?: (value: unknown) => unknown;
  serialize?: (value: unknown) => string | string[];
};

export type AdminTableSearchFilterOverride = {
  key?: string;
  default?: string[];
  parse?: (value: string[]) => string[];
  serialize?: (value: string[]) => string | string[];
};

export type AdminTableSearchOverrides = Partial<
  Record<"page" | "pageSize" | "sort" | "search" | "filters", AdminTableSearchConcernOverride>
> & {
  filters?: Record<string, AdminTableSearchFilterOverride> | AdminTableSearchConcernOverride;
};

export type AdminTableSearchOptions = {
  searchParams?: URLSearchParams | string | null;
  params?: URLSearchParams | string | null;
  url?: URLSearchParams | string | null;
  initialParams?: URLSearchParams | string | null;
  keys?: AdminTableSearchKeyMap;
  queryKeys?: AdminTableSearchKeyMap;
  paramKeys?: AdminTableSearchKeyMap;
  paramNames?: AdminTableSearchKeyMap;
  defaults?: AdminTableSearchDefaults;
  defaultState?: AdminTableSearchDefaults;
  initial?: AdminTableSearchDefaults;
  initialState?: AdminTableSearchDefaults;
  default?: AdminTableSearchDefaults;
  parse?: Record<string, (value: unknown) => unknown>;
  parsers?: Record<string, (value: unknown) => unknown>;
  parseOverrides?: Record<string, (value: unknown) => unknown>;
  serialize?: Record<string, (value: unknown) => string | string[]>;
  serializers?: Record<string, (value: unknown) => string | string[]>;
  serializeOverrides?: Record<string, (value: unknown) => string | string[]>;
  overrides?: AdminTableSearchOverrides;
  override?: AdminTableSearchOverrides;
  filters?: Record<string, AdminTableSearchFilterOverride>;
  filterOverrides?: Record<string, AdminTableSearchFilterOverride>;
  maxPageSize?: number;
  maxSearchLength?: number;
  // Per-concern shorthand overrides.
  page?: AdminTableSearchConcernOverride | number | string;
  pageSize?: AdminTableSearchConcernOverride | number | string;
  size?: AdminTableSearchConcernOverride | number | string;
  perPage?: AdminTableSearchConcernOverride | number | string;
  sort?: AdminTableSearchConcernOverride | AdminTableSearchSort | null;
  search?: AdminTableSearchConcernOverride | string;
  q?: AdminTableSearchConcernOverride | string;
  query?: AdminTableSearchConcernOverride | string;
};

type ResolvedKeys = {
  page: string;
  pageSize: string;
  sort: string;
  search: string;
  sortField?: string;
  sortDirection?: string;
};

type ResolvedAdminTableSearchOptions = {
  keys: ResolvedKeys;
  defaults: AdminTableSearchState;
  parse: {
    page?: (value: unknown) => unknown;
    pageSize?: (value: unknown) => unknown;
    sort?: (value: unknown) => unknown;
    search?: (value: unknown) => unknown;
    filters?: (value: string[]) => string[];
  };
  serialize: {
    page?: (value: unknown) => string | string[];
    pageSize?: (value: unknown) => string | string[];
    sort?: (value: unknown) => string | string[];
    search?: (value: unknown) => string | string[];
    filters?: Record<string, (value: string[]) => string | string[]>;
  };
  filterOverrides: Record<string, AdminTableSearchFilterOverride>;
  maxPageSize: number;
  maxSearchLength: number;
};

function toParams(input: unknown): URLSearchParams {
  if (input == null) return new URLSearchParams();
  if (input instanceof URLSearchParams) return new URLSearchParams(input.toString());
  if (typeof input === "string") return new URLSearchParams(input);
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (record.searchParams instanceof URLSearchParams) return new URLSearchParams(record.searchParams.toString());
    if (typeof record.toString === "function" && record.toString !== Object.prototype.toString) {
      try {
        return new URLSearchParams(String(record));
      } catch {
        return new URLSearchParams();
      }
    }
    // An object of key -> value(s).
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) for (const entry of value) params.append(key, String(entry));
      else if (value != null) params.set(key, String(value));
    }
    return params;
  }
  return new URLSearchParams();
}

function cloneFilters(value: unknown): AdminTableSearchFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: AdminTableSearchFilters = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(entry)) result[key] = entry.map((item) => String(item));
    else if (entry == null) result[key] = [];
    else result[key] = [String(entry)];
  }
  return result;
}

function isValidField(value: unknown): value is string {
  return typeof value === "string" && FIELD_PATH.test(value);
}

function mergeObjects(...values: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, value as Record<string, unknown>);
    }
  }
  return result;
}

function resolveOptions(raw: unknown): ResolvedAdminTableSearchOptions {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const keysInput = mergeObjects(input.keys, input.queryKeys, input.paramKeys, input.paramNames);
  const keys: ResolvedKeys = {
    page: typeof keysInput.page === "string" && keysInput.page ? keysInput.page : "page",
    pageSize:
      typeof keysInput.pageSize === "string" && keysInput.pageSize
        ? keysInput.pageSize
        : typeof keysInput.size === "string" && keysInput.size
          ? (keysInput.size as string)
          : "pageSize",
    sort: typeof keysInput.sort === "string" && keysInput.sort ? keysInput.sort : "sort",
    search:
      typeof keysInput.search === "string" && keysInput.search
        ? keysInput.search
        : typeof keysInput.q === "string" && keysInput.q
          ? (keysInput.q as string)
          : "search",
  };
  if (typeof keysInput.sortField === "string" && keysInput.sortField) keys.sortField = keysInput.sortField;
  if (typeof keysInput.sortDirection === "string" && keysInput.sortDirection) keys.sortDirection = keysInput.sortDirection;

  const defaultsInput = mergeObjects(input.defaults, input.defaultState, input.initial, input.initialState, input.default);
  const defaults: AdminTableSearchState = {
    page: typeof defaultsInput.page === "number" ? defaultsInput.page : DEFAULT_PAGE,
    pageSize: typeof defaultsInput.pageSize === "number" ? defaultsInput.pageSize : DEFAULT_PAGE_SIZE,
    sort:
      defaultsInput.sort === null
        ? null
        : defaultsInput.sort && typeof defaultsInput.sort === "object"
          ? (defaultsInput.sort as AdminTableSearchSort)
          : null,
    search: typeof defaultsInput.search === "string" ? defaultsInput.search : "",
    filters: cloneFilters(defaultsInput.filters),
  };

  const parseMap = mergeObjects(input.parse, input.parsers, input.parseOverrides);
  const serializeMap = mergeObjects(input.serialize, input.serializers, input.serializeOverrides);

  const overrides = mergeObjects(input.overrides, input.override);
  const filterOverridesInput = mergeObjects(input.filters && typeof input.filters === "object" && !("key" in (input.filters as object)) ? input.filters : {}, input.filterOverrides);
  // If input.filters is an override object with key/default/parse/serialize, treat as the filters concern.
  if (input.filters && typeof input.filters === "object" && ("key" in (input.filters as object) || "default" in (input.filters as object) || "parse" in (input.filters as object) || "serialize" in (input.filters as object))) {
    overrides.filters = mergeObjects(overrides.filters, input.filters as object);
  }

  const parse: ResolvedAdminTableSearchOptions["parse"] = {};
  const serialize: ResolvedAdminTableSearchOptions["serialize"] = { filters: {} };

  // Apply concern-level shorthand overrides.
  const concerns: Array<"page" | "pageSize" | "sort" | "search"> = ["page", "pageSize", "sort", "search"];
  const aliases: Record<string, "page" | "pageSize" | "sort" | "search"> = {
    size: "pageSize",
    perPage: "pageSize",
    q: "search",
    query: "search",
  };

  function applyConcern(concern: "page" | "pageSize" | "sort" | "search", source: unknown) {
    if (source == null) return;
    if (typeof source === "object" && !Array.isArray(source)) {
      const override = source as Record<string, unknown>;
      if (typeof override.key === "string" && override.key) {
        if (concern === "page") keys.page = override.key;
        if (concern === "pageSize") keys.pageSize = override.key;
        if (concern === "sort") keys.sort = override.key;
        if (concern === "search") keys.search = override.key;
      }
      if (override.default !== undefined) {
        if (concern === "page") defaults.page = Number(override.default) || defaults.page;
        if (concern === "pageSize") defaults.pageSize = Number(override.default) || defaults.pageSize;
        if (concern === "sort") defaults.sort = (override.default as AdminTableSearchSort | null) ?? null;
        if (concern === "search") defaults.search = String(override.default ?? "");
      }
      if (typeof override.parse === "function") parse[concern] = override.parse as (value: unknown) => unknown;
      if (typeof override.serialize === "function") serialize[concern] = override.serialize as (value: unknown) => string | string[];
    } else {
      // A primitive means a default value.
      if (concern === "page") defaults.page = Number(source) || defaults.page;
      if (concern === "pageSize") defaults.pageSize = Number(source) || defaults.pageSize;
      if (concern === "sort") defaults.sort = (source as AdminTableSearchSort | null) ?? null;
      if (concern === "search") defaults.search = String(source ?? "");
    }
  }

  for (const concern of concerns) {
    applyConcern(concern, input[concern]);
    const alias = Object.keys(aliases).find((name) => aliases[name] === concern && input[name] !== undefined);
    if (alias) applyConcern(concern, input[alias]);
  }

  // overrides object (per concern)
  for (const concern of concerns) {
    applyConcern(concern, overrides[concern]);
  }
  if (overrides.filters && typeof overrides.filters === "object" && !Array.isArray(overrides.filters) && ("key" in (overrides.filters as object) || "default" in (overrides.filters as object) || "parse" in (overrides.filters as object) || "serialize" in (overrides.filters as object))) {
    // filters concern override handled below
  }

  // Generic parse/serialize maps (keys by concern name)
  for (const concern of concerns) {
    if (typeof parseMap[concern] === "function") parse[concern] = parseMap[concern] as (value: unknown) => unknown;
    if (typeof serializeMap[concern] === "function") serialize[concern] = serializeMap[concern] as (value: unknown) => string | string[];
  }

  // Filter overrides.
  const filterOverrides: Record<string, AdminTableSearchFilterOverride> = {};
  for (const [key, value] of Object.entries(filterOverridesInput)) {
    if (value && typeof value === "object") filterOverrides[key] = value as AdminTableSearchFilterOverride;
  }
  if (overrides.filters && typeof overrides.filters === "object" && !Array.isArray(overrides.filters) && !("key" in (overrides.filters as object) || "default" in (overrides.filters as object) || "parse" in (overrides.filters as object) || "serialize" in (overrides.filters as object))) {
    for (const [key, value] of Object.entries(overrides.filters as Record<string, unknown>)) {
      if (value && typeof value === "object") filterOverrides[key] = value as AdminTableSearchFilterOverride;
    }
  }
  if (input.filterOverrides && typeof input.filterOverrides === "object") {
    for (const [key, value] of Object.entries(input.filterOverrides as Record<string, unknown>)) {
      if (value && typeof value === "object") filterOverrides[key] = value as AdminTableSearchFilterOverride;
    }
  }

  // Apply filter override keys/defaults to keys? Filters don't have a single key. But allow key rename per filter.
  for (const [filterKey, override] of Object.entries(filterOverrides)) {
    if (override.key && override.key !== filterKey) {
      // store rename by replacing key in filterOverrides
      filterOverrides[override.key] = { ...override, key: override.key };
      // keep original too? We'll keep both to be safe.
    }
  }

  // Filter defaults from defaults.filters merged with override defaults.
  for (const [key, override] of Object.entries(filterOverrides)) {
    if (Array.isArray(override.default)) {
      defaults.filters[key] = override.default.map(String);
    }
    const targetKey = override.key || key;
    if (targetKey !== key && Array.isArray(override.default)) {
      defaults.filters[targetKey] = override.default.map(String);
    }
  }

  const maxPageSize = typeof input.maxPageSize === "number" && input.maxPageSize > 0 ? input.maxPageSize : DEFAULT_MAX_PAGE_SIZE;
  const maxSearchLength = typeof input.maxSearchLength === "number" && input.maxSearchLength > 0 ? input.maxSearchLength : DEFAULT_MAX_SEARCH;

  return {
    keys,
    defaults,
    parse,
    serialize,
    filterOverrides,
    maxPageSize,
    maxSearchLength,
  };
}

function parsePageValue(raw: unknown, opts: ResolvedAdminTableSearchOptions, fallback: number): number {
  if (raw == null) return fallback;
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text === "number") {
    if (Number.isInteger(text) && text >= 1 && text <= opts.maxPageSize) return text;
    return fallback;
  }
  const value = Number(String(text).trim());
  if (!Number.isInteger(value) || value < 1 || value > opts.maxPageSize) return fallback;
  if (typeof opts.parse.page === "function") {
    try {
      const parsed = opts.parse.page(value);
      if (typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 1) return parsed;
    } catch {
      return fallback;
    }
  }
  return value;
}

function parsePageSizeValue(raw: unknown, opts: ResolvedAdminTableSearchOptions, fallback: number): number {
  return parsePageValue(raw, opts, fallback) > opts.maxPageSize ? fallback : parsePageValue(raw, opts, fallback);
}

function parseSortValue(raw: unknown, opts: ResolvedAdminTableSearchOptions, fallback: AdminTableSearchSort | null): AdminTableSearchSort | null {
  if (raw == null) {
    if (typeof opts.parse.sort === "function") {
      try {
        const parsed = opts.parse.sort(null);
        if (parsed === null) return null;
        if (parsed && typeof parsed === "object" && isValidField((parsed as AdminTableSearchSort).field)) return parsed as AdminTableSearchSort;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  const text = Array.isArray(raw) ? raw[0] : raw;
  let field: string | null = null;
  let direction: AdminTableSearchDirection = "asc";
  if (typeof text === "string") {
    const value = text.trim();
    if (value === "") return fallback;
    if (value.includes(":")) {
      const [f, d] = value.split(":", 2);
      field = f.trim();
      direction = d.trim().toLowerCase() === "desc" ? "desc" : "asc";
      if (d.trim() && d.trim().toLowerCase() !== "asc" && d.trim().toLowerCase() !== "desc") return fallback;
    } else if (value.includes(",")) {
      const [f, d] = value.split(",", 2);
      field = f.trim();
      direction = d.trim().toLowerCase() === "desc" ? "desc" : "asc";
      if (d.trim() && d.trim().toLowerCase() !== "asc" && d.trim().toLowerCase() !== "desc") return fallback;
    } else {
      field = value;
    }
  } else if (text && typeof text === "object") {
    const candidate = text as AdminTableSearchSort;
    if (isValidField(candidate.field)) {
      field = candidate.field;
      direction = candidate.direction === "desc" ? "desc" : "asc";
    } else {
      return fallback;
    }
  }
  if (!isValidField(field)) return fallback;
  const result = { field: field as string, direction };
  if (typeof opts.parse.sort === "function") {
    try {
      const parsed = opts.parse.sort(result);
      if (parsed === null) return null;
      if (parsed && typeof parsed === "object" && isValidField((parsed as AdminTableSearchSort).field)) {
        return {
          field: (parsed as AdminTableSearchSort).field,
          direction: (parsed as AdminTableSearchSort).direction === "desc" ? "desc" : "asc",
        };
      }
      return fallback;
    } catch {
      return fallback;
    }
  }
  return result;
}

function parseSearchValue(raw: unknown, opts: ResolvedAdminTableSearchOptions, fallback: string): string {
  if (raw == null) return fallback;
  const text = Array.isArray(raw) ? raw[0] : raw;
  const value = String(text).trim();
  if (value.length > opts.maxSearchLength) return fallback;
  if (typeof opts.parse.search === "function") {
    try {
      const parsed = opts.parse.search(value);
      if (typeof parsed === "string") return parsed.trim().slice(0, opts.maxSearchLength);
      return fallback;
    } catch {
      return fallback;
    }
  }
  return value;
}

function parseFiltersValue(
  params: URLSearchParams,
  opts: ResolvedAdminTableSearchOptions,
  fallback: AdminTableSearchFilters,
): AdminTableSearchFilters {
  const result: AdminTableSearchFilters = { ...fallback };
  const reserved = new Set<string>([
    opts.keys.page,
    opts.keys.pageSize,
    opts.keys.sort,
    opts.keys.search,
    ...(opts.keys.sortField ? [opts.keys.sortField] : []),
    ...(opts.keys.sortDirection ? [opts.keys.sortDirection] : []),
  ]);

  // Optional JSON filters.
  if (params.has("filters")) {
    try {
      const parsed = JSON.parse(params.get("filters") as string);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (Array.isArray(value)) result[key] = value.map(String);
          else if (value != null) result[key] = [String(value)];
        }
      }
    } catch {
      // degrade safely
    }
  }

  for (const key of params.keys()) {
    if (reserved.has(key)) continue;
    const override = opts.filterOverrides[key];
    const targetKey = override?.key || key;
    let values = params.getAll(key).flatMap((entry) => String(entry).split(",")).map((entry) => entry.trim()).filter(Boolean);
    if (typeof override?.parse === "function") {
      try {
        const parsed = override.parse(values);
        values = Array.isArray(parsed) ? parsed.map(String) : parsed == null ? [] : [String(parsed)];
      } catch {
        continue;
      }
    } else if (typeof opts.parse.filters === "function") {
      try {
        const parsed = opts.parse.filters(values);
        values = Array.isArray(parsed) ? parsed.map(String) : parsed == null ? [] : [String(parsed)];
      } catch {
        continue;
      }
    }
    if (values.length > 0) result[targetKey] = values;
    else if (Object.prototype.hasOwnProperty.call(result, targetKey)) result[targetKey] = [];
  }

  // Apply override defaults for missing filters.
  for (const [key, override] of Object.entries(opts.filterOverrides)) {
    const targetKey = override.key || key;
    if (result[targetKey] === undefined && Array.isArray(override.default)) {
      result[targetKey] = override.default.map(String);
    }
  }

  return result;
}

function parseState(params: URLSearchParams, opts: ResolvedAdminTableSearchOptions): AdminTableSearchState {
  // Separate sort keys.
  let sortRaw: unknown = null;
  if (opts.keys.sortField && params.has(opts.keys.sortField)) {
    const field = params.get(opts.keys.sortField);
    const direction = opts.keys.sortDirection ? params.get(opts.keys.sortDirection) : null;
    sortRaw = { field, direction: direction ?? "asc" };
  } else if (params.has(opts.keys.sort)) {
    sortRaw = params.get(opts.keys.sort);
  }

  const pageRaw = params.has(opts.keys.page) ? params.get(opts.keys.page) : null;
  const pageSizeRaw = params.has(opts.keys.pageSize) ? params.get(opts.keys.pageSize) : null;
  const searchRaw = params.has(opts.keys.search) ? params.get(opts.keys.search) : null;

  const page = pageRaw == null
    ? opts.defaults.page
    : parsePageValue(pageRaw, opts, opts.defaults.page);
  const pageSize = pageSizeRaw == null
    ? opts.defaults.pageSize
    : parsePageSizeValue(pageSizeRaw, opts, opts.defaults.pageSize);
  const sort = sortRaw == null
    ? opts.defaults.sort
    : parseSortValue(sortRaw, opts, opts.defaults.sort);
  const search = searchRaw == null
    ? opts.defaults.search
    : parseSearchValue(searchRaw, opts, opts.defaults.search);
  const filters = parseFiltersValue(params, opts, opts.defaults.filters);

  return { page, pageSize, sort, search, filters };
}

function serializeScalar(
  concern: "page" | "pageSize" | "search",
  value: unknown,
  opts: ResolvedAdminTableSearchOptions,
): string | string[] | null {
  const serializer = opts.serialize[concern];
  if (typeof serializer === "function") {
    try {
      return serializer(value);
    } catch {
      return null;
    }
  }
  if (value == null) return null;
  return String(value);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function serializeState(
  state: AdminTableSearchState,
  opts: ResolvedAdminTableSearchOptions,
  base?: URLSearchParams | string | null,
): URLSearchParams {
  const params = toParams(base ?? null);
  const managedKeys = new Set<string>([
    opts.keys.page,
    opts.keys.pageSize,
    opts.keys.sort,
    opts.keys.search,
    ...(opts.keys.sortField ? [opts.keys.sortField] : []),
    ...(opts.keys.sortDirection ? [opts.keys.sortDirection] : []),
    ...Object.keys(state.filters),
    ...Object.keys(opts.defaults.filters),
    ...Object.keys(opts.filterOverrides),
  ]);
  for (const key of managedKeys) params.delete(key);

  // page
  if (state.page !== opts.defaults.page) {
    const serialized = serializeScalar("page", state.page, opts);
    if (serialized != null) {
      if (Array.isArray(serialized)) for (const entry of serialized) params.append(opts.keys.page, entry);
      else params.set(opts.keys.page, serialized);
    }
  } else {
    // Keep explicit page when it differs after serialization? Already handled.
  }

  // pageSize
  if (state.pageSize !== opts.defaults.pageSize) {
    const serialized = serializeScalar("pageSize", state.pageSize, opts);
    if (serialized != null) {
      if (Array.isArray(serialized)) for (const entry of serialized) params.append(opts.keys.pageSize, entry);
      else params.set(opts.keys.pageSize, serialized);
    }
  }

  // sort
  if (opts.keys.sortField) {
    if (state.sort) {
      params.set(opts.keys.sortField, state.sort.field);
      if (opts.keys.sortDirection) params.set(opts.keys.sortDirection, state.sort.direction);
    }
  } else if (state.sort && state.sort !== opts.defaults.sort) {
    const serializer = opts.serialize.sort;
     let serialized: string | string[] | null;
    if (typeof serializer === "function") {
      try {
        serialized = serializer(state.sort);
      } catch {
        serialized = null;
      }
    } else {
      serialized = `${state.sort.field}:${state.sort.direction}`;
    }
    if (serialized != null) {
      if (Array.isArray(serialized)) for (const entry of serialized) params.append(opts.keys.sort, entry);
      else params.set(opts.keys.sort, serialized);
    }
  }

  // search
  if (state.search !== opts.defaults.search) {
    const serialized = serializeScalar("search", state.search, opts);
    if (serialized != null) {
      if (Array.isArray(serialized)) for (const entry of serialized) params.append(opts.keys.search, entry);
      else params.set(opts.keys.search, serialized);
    } else {
      params.set(opts.keys.search, state.search);
    }
  }

  // filters
  const filterKeys = new Set<string>([
    ...Object.keys(state.filters),
    ...Object.keys(opts.defaults.filters),
    ...Object.keys(opts.filterOverrides),
  ]);
  for (const key of filterKeys) {
    const override = opts.filterOverrides[key];
    const targetKey = override?.key || key;
    const values = state.filters[key] ?? state.filters[targetKey] ?? [];
    const defaultValues = opts.defaults.filters[key] ?? opts.defaults.filters[targetKey] ?? [];
    if (arraysEqual(values, defaultValues)) continue;
    if (values.length === 0) {
      if (defaultValues.length > 0) params.set(targetKey, "");
      else params.delete(targetKey);
      continue;
    }
    let serialized: string | string[] | null = null;
    if (typeof override?.serialize === "function") {
      try {
        serialized = override.serialize(values);
      } catch {
        serialized = null;
      }
    } else if (override?.serialize === undefined && typeof opts.serialize.filters?.[key] === "function") {
      try {
        serialized = opts.serialize.filters[key](values);
      } catch {
        serialized = null;
      }
    }
    if (serialized == null) serialized = values.join(",");
    if (Array.isArray(serialized)) {
      params.delete(targetKey);
      for (const entry of serialized) params.append(targetKey, entry);
    } else {
      params.set(targetKey, serialized);
    }
  }

  return params;
}

export type AdminTableSearchAdapter = {
  options: ResolvedAdminTableSearchOptions;
  keys: ResolvedKeys;
  defaults: AdminTableSearchState;
  state: AdminTableSearchState;
  searchParams: URLSearchParams;
  page: number;
  pageSize: number;
  sort: AdminTableSearchSort | null;
  search: string;
  filters: AdminTableSearchFilters;
  parse: (input?: URLSearchParams | string | null) => AdminTableSearchState;
  read: (input?: URLSearchParams | string | null) => AdminTableSearchState;
  serialize: (state?: AdminTableSearchState, base?: URLSearchParams | string | null) => URLSearchParams;
  write: (state?: AdminTableSearchState, base?: URLSearchParams | string | null) => URLSearchParams;
  toSearchParams: (state?: AdminTableSearchState, base?: URLSearchParams | string | null) => URLSearchParams;
  toString: () => string;
  setPage: (value: number | string) => AdminTableSearchState;
  setPageSize: (value: number | string) => AdminTableSearchState;
  setSort: (field: string | null, direction?: AdminTableSearchDirection) => AdminTableSearchState;
  setSearch: (value: string) => AdminTableSearchState;
  setFilter: (key: string, value: string | string[]) => AdminTableSearchState;
  setFilters: (filters: AdminTableSearchFilters) => AdminTableSearchState;
  clearFilters: (key?: string) => AdminTableSearchState;
  reset: () => AdminTableSearchState;
};

export function parseAdminTableSearchParams(input?: URLSearchParams | string | null, options?: AdminTableSearchOptions): AdminTableSearchState {
  const opts = resolveOptions(options ?? {});
  return parseState(toParams(input), opts);
}

export function serializeAdminTableSearchParams(
  state: AdminTableSearchState,
  second?: URLSearchParams | string | AdminTableSearchOptions | null,
  third?: AdminTableSearchOptions,
): URLSearchParams {
  let base: URLSearchParams | string | null = null;
  let options: AdminTableSearchOptions | undefined;
  if (second instanceof URLSearchParams || typeof second === "string") {
    base = second;
    options = third;
  } else if (second && typeof second === "object") {
    // Could be options or a state-like object. Distinguish by presence of page/pageSize.
    const candidate = second as Record<string, unknown>;
    if ("page" in candidate && "pageSize" in candidate && "filters" in candidate) {
      // Actually second is state? But signature state first; ignore.
      options = third;
    } else {
      options = second as AdminTableSearchOptions;
    }
  }
  const opts = resolveOptions(options ?? {});
  return serializeState(state, opts, base);
}

export function createAdminTableSearchAdapter(input: AdminTableSearchOptions | URLSearchParams | string | null = {}): AdminTableSearchAdapter {
  let raw: Record<string, unknown> = {};
  if (input instanceof URLSearchParams || typeof input === "string") {
    raw = { searchParams: input };
  } else if (input && typeof input === "object") {
    raw = input as Record<string, unknown>;
  }

  const opts = resolveOptions(raw);
  let currentParams = toParams(raw.searchParams ?? raw.params ?? raw.url ?? raw.initialParams ?? new URLSearchParams());
  let state = parseState(currentParams, opts);

  const adapter: AdminTableSearchAdapter = {
    get options() {
      return opts;
    },
    get keys() {
      return opts.keys;
    },
    get defaults() {
      return opts.defaults;
    },
    get state() {
      return state;
    },
    set state(value: AdminTableSearchState) {
      state = value;
    },
    get searchParams() {
      return currentParams;
    },
    get page() {
      return state.page;
    },
    get pageSize() {
      return state.pageSize;
    },
    get sort() {
      return state.sort;
    },
    get search() {
      return state.search;
    },
    get filters() {
      return state.filters;
    },
    parse(nextInput?: URLSearchParams | string | null) {
      if (nextInput !== undefined) currentParams = toParams(nextInput);
      state = parseState(currentParams, opts);
      adapter.state = state;
      return state;
    },
    read(nextInput?: URLSearchParams | string | null) {
      return adapter.parse(nextInput);
    },
    serialize(nextState?: AdminTableSearchState, base?: URLSearchParams | string | null) {
      if (nextState !== undefined) state = nextState;
      const params = serializeState(state, opts, base);
      currentParams = params;
      adapter.state = state;
      return params;
    },
    write(nextState?: AdminTableSearchState, base?: URLSearchParams | string | null) {
      return adapter.serialize(nextState, base);
    },
    toSearchParams(nextState?: AdminTableSearchState, base?: URLSearchParams | string | null) {
      return adapter.serialize(nextState, base);
    },
    toString() {
      return currentParams.toString();
    },
    setPage(value: number | string) {
      state = { ...state, page: parsePageValue(value, opts, state.page) };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    setPageSize(value: number | string) {
      state = { ...state, pageSize: parsePageSizeValue(value, opts, state.pageSize) };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    setSort(field: string | null, direction?: AdminTableSearchDirection) {
      if (field == null) {
        state = { ...state, sort: null };
      } else if (isValidField(field)) {
        state = { ...state, sort: { field, direction: direction === "desc" ? "desc" : "asc" } };
      }
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    setSearch(value: string) {
      state = { ...state, search: parseSearchValue(value, opts, state.search) };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    setFilter(key: string, value: string | string[]) {
      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      const filters = { ...state.filters, [key]: values.filter(Boolean) };
      if (filters[key].length === 0) delete filters[key];
      state = { ...state, filters };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    setFilters(filters: AdminTableSearchFilters) {
      state = { ...state, filters: cloneFilters(filters) };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    clearFilters(key?: string) {
      if (key) {
        const filters = { ...state.filters };
        delete filters[key];
        state = { ...state, filters };
      } else {
        state = { ...state, filters: { ...opts.defaults.filters } };
      }
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
    reset() {
      state = parseState(new URLSearchParams(), opts);
      // Reset to defaults, not parse empty (which yields defaults).
      state = { ...opts.defaults, filters: cloneFilters(opts.defaults.filters) };
      adapter.state = state;
      currentParams = serializeState(state, opts);
      return state;
    },
  };

  // Initial sync so searchParams reflects parsed state.
  currentParams = serializeState(state, opts);
  adapter.state = state;

  return adapter;
}
