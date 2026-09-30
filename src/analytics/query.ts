// SPDX-License-Identifier: MIT

/**
 * Reading captured events back as the figures a chart draws.
 *
 * Every figure here is `adminAggregate` over rows the store handed over, and none of it buckets on
 * its own: the range discipline, the zeros for a period nothing landed on, the exclusion of a row
 * outside the range and the total summed off the buckets are all that function's rules, and they
 * hold for an order and for something a person did without either one knowing the other exists.
 *
 * The range is day keys, which is what the package's charts already take, and a week or a month is a
 * group of days rather than a second kind of period. Two range types would mean the two places that
 * place a row disagreed about a month, and a row is placed in one place.
 *
 * What a read costs is the same thing the aggregation already says about orders, and it is worse here
 * rather than better: a visitor table is the fastest growing table an admin has, and one row per page
 * view is a row per request. The bounds are pushed into the store's own query where the store has a
 * paged one, and a read is refused rather than truncated when the range holds more rows than one
 * read may return, because thirty points built from the first thousand views of a month is a chart
 * reporting the month as those thousand views. The cap is `ADMIN_RESOURCE_MAX_LIMIT`, the query
 * contract's own window cap, not a number chosen here. Past it the answer is a store that sums in
 * SQL, and until a host has one this is the whole of it.
 */

import { adminAggregate } from "../aggregate/aggregate.js";
import { adminChartDayKey } from "../charts/series.js";
import { ADMIN_RESOURCE_MAX_LIMIT, type AdminResourceFilter } from "../adapters/query.js";
import type { AdminPersistenceAdapter } from "../adapters/host.js";
import { ADMIN_ANALYTICS_RESOURCE, AdminAnalyticsError, type AdminAnalyticsEventRow } from "./events.js";

/**
 * The most events one read may return.
 *
 * The query contract's own window cap rather than a figure of its own, so a host that wants more has
 * to raise the contract first and finds out that it cannot.
 */
export const ADMIN_ANALYTICS_MAX_EVENTS_PER_READ = ADMIN_RESOURCE_MAX_LIMIT;

/** The column the bounds are pushed into, which is the one every row this layer writes is ordered by. */
const OCCURRED_AT = "occurred_at";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type AdminAnalyticsReadOptions = {
  /**
   * The day keys the answer covers, oldest first, as `adminChartDayRange` returns them.
   *
   * This is what the bounds are pushed into and what the zeros are emitted for, so a caller that
   * names no range gets an unbounded read and no zeros.
   */
  range?: readonly string[];
  /** Only events of this kind, for a host counting one thing rather than everything. */
  kind?: string;
  /**
   * How many events one read may return, up to the query contract's window cap.
   *
   * Named for what it bounds rather than `limit`, because a query that also returns a ranked list
   * takes a `limit` meaning how many of that list, and one options object carrying two meanings of
   * `limit` is a bug waiting for a caller who reads the wrong one.
   */
  maxEvents?: number;
};

function readCap(options: AdminAnalyticsReadOptions): number {
  const asked = options.maxEvents ?? ADMIN_ANALYTICS_MAX_EVENTS_PER_READ;
  if (!Number.isSafeInteger(asked) || asked < 1) {
    throw new AdminAnalyticsError(`a read limit of ${String(asked)} is not a whole number from one up.`);
  }
  if (asked > ADMIN_ANALYTICS_MAX_EVENTS_PER_READ) {
    throw new AdminAnalyticsError(
      `a read limit of ${asked} is above the ${ADMIN_ANALYTICS_MAX_EVENTS_PER_READ} the query ` +
        "contract allows, and a window the store will not serve cannot be reached by asking twice.",
    );
  }
  return asked;
}

/** The first and last moment a run of day keys covers. */
function boundsOf(range: readonly string[]): { from: string; to: string } {
  const first = range[0]!;
  const last = range[range.length - 1]!;
  return { from: `${first}T00:00:00.000Z`, to: `${last}T23:59:59.999Z` };
}

function refuseRange(range: readonly string[]): never {
  throw new AdminAnalyticsError(
    `a range of ${JSON.stringify(range)} is not a run of day keys. Take one from ` +
      "`adminChartDayRange`, which is the range the package's charts are drawn over. A period that is " +
      "not a day is a group of days, and a range that cannot say which moments it covers cannot " +
      "narrow a read at the store.",
  );
}

/**
 * The events a range covers, newest first.
 *
 * The bounds are pushed down so a store with a paged query never reads the rest of the table, and
 * then applied again through `adminChartDayKey` on the rows that came back, so a store that has no
 * paged query and one that does return the same set rather than two answers to one question.
 *
 * Newest first is not cosmetic: `adminAggregate` keeps the first row it files in a bucket, so
 * ordering by time is what turns its `label` hook into the most recent view of a path without this
 * file keeping a second map of maximums.
 */
export async function adminAnalyticsRead(
  store: AdminPersistenceAdapter,
  options: AdminAnalyticsReadOptions = {},
): Promise<AdminAnalyticsEventRow[]> {
  const limit = readCap(options);
  const range = options.range;
  if (range !== undefined) {
    if (range.length === 0 || !range.every((key) => DAY.test(key))) refuseRange([...range]);
  }
  const bounds = range === undefined ? null : boundsOf(range);
  const within = bounds === null
    ? (): boolean => true
    : (row: AdminAnalyticsEventRow): boolean => {
        const day = adminChartDayKey(row.occurred_at);
        return day !== null && row.occurred_at >= bounds.from && row.occurred_at <= bounds.to;
      };

  const filters: AdminResourceFilter[] = [];
  if (bounds) {
    filters.push({ field: OCCURRED_AT, operator: "gte", value: bounds.from });
    filters.push({ field: OCCURRED_AT, operator: "lte", value: bounds.to });
  }
  if (options.kind !== undefined) filters.push({ field: "kind", operator: "eq", value: options.kind });

  const sort = [{ field: OCCURRED_AT, direction: "desc" as const }];

  if (store.queryPage !== undefined) {
    const page = await store.queryPage<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE, {
      filter: filters.length > 0 ? filters : undefined,
      sort,
      window: { offset: 0, limit },
    });
    if (page.total > limit) oversize(page.total, limit);
    return page.rows.filter(within);
  }

  // A store with no paged query is read whole, and the whole read is paid before the refusal below
  // rather than avoided by it. That is the cost of not having opted into `queryPage`, and it is the
  // reason the refusal is worth a host's attention rather than a shrug.
  const all = await store.query<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE);
  const rows = all
    .filter(within)
    .filter((row) => (options.kind === undefined ? true : row.kind === options.kind))
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
  if (rows.length > limit) oversize(rows.length, limit);
  return rows;
}

function oversize(found: number, limit: number): never {
  throw new AdminAnalyticsError(
    `that range holds ${found} events and one read returns at most ${limit}. Narrow the range, or ` +
      "give the host a store that sums in SQL, because a chart built from the first rows of a range " +
      "is a chart reporting the range as those rows.",
  );
}

export type AdminAnalyticsPoint = {
  /** The day, as the range named it. */
  key: string;
  label: string;
  /** Events on the day, whether or not they carried a key. */
  views: number;
  /**
   * Distinct visitor keys on the day.
   *
   * Zero on a day whose every event arrived without one, which is the chosen answer rather than the
   * whole of the views: a unique count built from keys nobody supplied is a number about nobody.
   */
  visitors: number;
  /** Views on the day that carried no key, so a host can see how much of its range is unattributed. */
  unattributed: number;
};

export type AdminAnalyticsTotals = {
  /** Events across the range, which is the sum of the points' `views`. */
  views: number;
  /**
   * Distinct keys across the whole range, deliberately not the sum of the points' `visitors`:
   * somebody who came on three days is three views and one visitor.
   */
  visitors: number;
  /** Views across the range that carried no key. */
  unattributed: number;
  /**
   * Events the store holds that carry no day at all, in neither the points nor the totals.
   *
   * A range excludes them at the read, so this is the count a host sees when it reads without one:
   * a table holding rows this layer cannot read is worth saying out loud, and a count that is
   * structurally always zero would not say it. An event dated outside a range is not counted here
   * because the read never handed it over, which is the same reason its exclusion is not a failure.
   */
  unkeyed: number;
};

export type AdminAnalyticsSeries = {
  /** One per day in the range, holding a zero where nothing landed. */
  points: AdminAnalyticsPoint[];
  totals: AdminAnalyticsTotals;
};

export type AdminAnalyticsSeriesOptions = AdminAnalyticsReadOptions & {
  /** How a day is named on the axis. The key when absent, which is a name and not a date. */
  label?: (key: string) => string;
};

/** One row per distinct day and key pair, which is what a distinct count needs and a sum cannot express. */
type DistinctVisitor = { day: string; visitorKey: string };

/**
 * The distinct keys per day, as rows rather than as a second bucketing.
 *
 * `adminAggregate` sums measures over rows, and one visitor arriving twice is two rows, so the
 * distinct count is a reduction over the rows before they are handed over rather than a measure over
 * them. It reads the same day the views call reads, so a row the range cannot place is placed by
 * neither and is counted in the same `unkeyed`.
 */
function distinctVisitors(rows: readonly AdminAnalyticsEventRow[]): DistinctVisitor[] {
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = row.visitor_key;
    if (key === null || key === undefined || key === "") continue;
    const day = adminChartDayKey(row.occurred_at);
    if (day === null) continue;
    const keys = seen.get(day);
    if (keys === undefined) seen.set(day, new Set([key]));
    else keys.add(key);
  }
  const reduced: DistinctVisitor[] = [];
  for (const [day, keys] of seen) {
    for (const visitorKey of keys) reduced.push({ day, visitorKey });
  }
  return reduced;
}

/**
 * Views, unique visitors and unattributed views per day, over a range, and the totals they add to.
 *
 * The three figures come out of two calls to the aggregation over the same rows rather than three
 * hand-rolled loops, so a total and its points cannot disagree with each other and an event outside
 * the range is in neither.
 */
export async function adminAnalyticsSeries(
  store: AdminPersistenceAdapter,
  options: AdminAnalyticsSeriesOptions = {},
): Promise<AdminAnalyticsSeries> {
  const rows = await adminAnalyticsRead(store, options);
  const range = options.range;
  const label = options.label ?? ((key: string) => key);

  const views = adminAggregate({
    rows,
    range,
    key: (row) => adminChartDayKey(row.occurred_at),
    label: (key) => label(key),
    measures: {
      views: () => 1,
      unattributed: (row) => (row.visitor_key === null || row.visitor_key === undefined ? 1 : 0),
    },
  });

  const distinct = distinctVisitors(rows);
  const visitors = adminAggregate({
    rows: distinct,
    range,
    key: (row) => row.day,
    label: (key) => label(key),
    measures: { visitors: () => 1 },
  });

  const perDay = new Map(visitors.buckets.map((bucket) => [bucket.key, bucket.values.visitors]));

  return {
    points: views.buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      views: bucket.values.views,
      visitors: perDay.get(bucket.key) ?? 0,
      unattributed: bucket.values.unattributed,
    })),
    totals: {
      views: views.totals.views,
      visitors: new Set(distinct.map((row) => row.visitorKey)).size,
      unattributed: views.totals.unattributed,
      unkeyed: views.unkeyed,
    },
  };
}

export type AdminAnalyticsTopPath = {
  path: string;
  /** Events on the path, which is what makes it a top path. */
  views: number;
  /** The most recent event on it, or null for a path the store has no moment for. */
  lastViewedAt: string | null;
};

export type AdminAnalyticsTopPaths = {
  paths: AdminAnalyticsTopPath[];
  /** Paths in the range, before the limit. A limit of five over nine paths is a five, not a nine. */
  total: number;
  /** Events whose path was blank, which is in neither the list nor a count of paths. */
  unkeyed: number;
};

export type AdminAnalyticsTopPathsOptions = AdminAnalyticsReadOptions & {
  /** How many paths to return. */
  limit: number;
};

/**
 * The paths with the most events on them, each with when it was last looked at.
 *
 * Ranked on the count and then on the path, so two paths with the same count do not swap places
 * between loads and a table does not appear to shuffle on its own. The last view is the aggregation's
 * `label` hook rather than a second pass, because the read hands the rows over newest first.
 */
export async function adminAnalyticsTopPaths(
  store: AdminPersistenceAdapter,
  options: AdminAnalyticsTopPathsOptions,
): Promise<AdminAnalyticsTopPaths> {
  const rows = await adminAnalyticsRead(store, options);
  const byPath = adminAggregate({
    rows,
    key: (row) => row.path,
    label: (_path, row) => row?.occurred_at ?? "",
    measures: { views: () => 1 },
  });

  const paths = byPath.buckets
    .map((bucket) => ({
      path: bucket.key,
      views: bucket.values.views,
      lastViewedAt: bucket.label === "" ? null : bucket.label,
    }))
    .sort((left, right) => right.views - left.views || left.path.localeCompare(right.path))
    .slice(0, Math.max(0, Math.floor(options.limit)));

  return { paths, total: byPath.buckets.length, unkeyed: byPath.unkeyed };
}

export type AdminAnalyticsSource = {
  /** The label the host recorded with the event, which is the host's own vocabulary. */
  source: string;
  label: string;
  /** Events carrying it. */
  views: number;
};

export type AdminAnalyticsSources = {
  sources: AdminAnalyticsSource[];
  /** Sources in the range, before the limit. */
  total: number;
  /**
   * Views that carried no source, which is in neither the list nor a count of sources.
   *
   * A visitor arriving from a bookmark and one arriving from a link the referrer policy withheld are
   * the same event here, and the count of them is how a host knows how much of its range is a
   * direct visit it cannot name.
   */
  unattributed: number;
};

export type AdminAnalyticsSourcesOptions = AdminAnalyticsReadOptions & {
  /** How many sources to return. */
  limit: number;
  /**
   * How a recorded source is named in the answer.
   *
   * The label a host ships (`utm_source`, a referrer host, a campaign it chose) is a host's own
   * vocabulary, so naming it is a host's own decision. None means the recorded value.
   */
  label?: (source: string) => string;
};

/**
 * Where the events came from, ranked.
 *
 * Ranked on the count and then on the source, so two sources with the same count hold still between
 * loads. A blank source is not a source: it lands in `unattributed` rather than in a bucket, which
 * is the same discipline the aggregation applies to a row it cannot key.
 */
export async function adminAnalyticsSources(
  store: AdminPersistenceAdapter,
  options: AdminAnalyticsSourcesOptions,
): Promise<AdminAnalyticsSources> {
  const rows = await adminAnalyticsRead(store, options);
  const bySource = adminAggregate({
    rows,
    key: (row) => row.source,
    measures: { views: () => 1 },
  });
  const label = options.label ?? ((source: string) => source);

  const sources = bySource.buckets
    .map((bucket) => ({ source: bucket.key, label: label(bucket.key), views: bucket.values.views }))
    .sort((left, right) => right.views - left.views || left.source.localeCompare(right.source))
    .slice(0, Math.max(0, Math.floor(options.limit)));

  return { sources, total: bySource.buckets.length, unattributed: bySource.unkeyed };
}
export type AdminAnalyticsRetainOptions = {
  /**
   * How long an event is kept, in whole days. The host's number, and required rather than defaulted:
   * how long a table of visits is allowed to grow is a decision about the people in it, and this
   * package does not get to pick one.
   */
  days: number;
  /** The moment "now" is. The wall clock when absent, and injected in tests rather than slept through. */
  now?: () => Date;
  /**
   * How many deletions one call makes before it stops and says there are more.
   *
   * Named for what it bounds rather than `limit`, so it cannot be read as the read's `maxEvents`:
   * one is a window a store will serve and the other is a budget across several of them.
   */
  maxRemovals?: number;
};

export type AdminAnalyticsRetention = {
  /** The window asked for. */
  days: number;
  /** The moment before which an event is removed, as an ISO instant. */
  cutoff: string;
  /** Events this call removed. */
  removed: number;
  /** Events this call read, which is what one prune costs against the store. */
  examined: number;
  /**
   * Whether events older than the cutoff are still there.
   *
   * A prune that stopped at its limit says so rather than reporting a clean table. An export refuses
   * a partial file because a truncated one is undetectable; a prune is the opposite, it is
   * idempotent, so the useful answer is "call me again" rather than an error.
   */
  more: boolean;
};

/**
 * The events older than the cutoff, oldest first, and how many of them the store holds in all.
 *
 * Not `adminAnalyticsRead`, which answers the opposite question: that one narrows to a named range
 * and comes back newest first, and a prune wants everything before a moment rather than everything
 * inside one.
 */
async function readExpired(
  store: AdminPersistenceAdapter,
  cutoff: string,
  window: { offset: number; limit: number },
): Promise<{ rows: AdminAnalyticsEventRow[]; total: number }> {
  const oldest = [{ field: OCCURRED_AT, direction: "asc" as const }];
  const before = [{ field: OCCURRED_AT, operator: "lt" as const, value: cutoff }];

  if (store.queryPage !== undefined) {
    const page = await store.queryPage<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE, {
      filter: before,
      sort: oldest,
      window,
    });
    return { rows: page.rows, total: page.total };
  }

  // Read again on each pass rather than once, so the rows a page held are gone by the time the next
  // one is asked for. On a store with no paged query that is one whole read per pass, which is the
  // cost of the shape and the reason a host with a real table should give it a paged query.
  const all = await store.query<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE);
  const expired = all
    .filter((row) => row.occurred_at < cutoff)
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
  return { rows: expired.slice(window.offset, window.offset + window.limit), total: expired.length };
}

/**
 * Removes the events older than the window the host named, and says what it left.
 *
 * The comparison is exclusive of the cutoff, so an event stamped exactly on the boundary is kept and
 * one a moment earlier is removed. Page by page from the oldest, because a prune that could only
 * remove a single read's worth of rows would not drain a table that had already grown past it, which
 * is the case a prune exists for.
 *
 * A delete that fails throws rather than being counted as removed, and the call is safe to run again
 * because removing the same rows twice removes the same rows.
 */
export async function adminAnalyticsRetain(
  store: AdminPersistenceAdapter,
  options: AdminAnalyticsRetainOptions,
): Promise<AdminAnalyticsRetention> {
  const days = options.days;
  if (!Number.isFinite(days) || days <= 0) {
    throw new AdminAnalyticsError(
      `a retention window of ${String(days)} days is not a positive number of days. Name one, because ` +
        "how long a table of visits is kept is a decision this package does not get to make.",
    );
  }
  const limit = Math.max(1, Math.floor(options.maxRemovals ?? ADMIN_ANALYTICS_MAX_EVENTS_PER_READ));
  const cutoff = new Date((options.now?.() ?? new Date()).getTime() - days * 86_400_000).toISOString();

  let removed = 0;
  let examined = 0;
  let more = false;

  // Always from the first row rather than from an offset, because the rows a page held are gone by
  // the time the next one is asked for, and an offset would step over whatever replaced them.
  while (removed < limit) {
    const wanted = Math.min(ADMIN_ANALYTICS_MAX_EVENTS_PER_READ, limit - removed);
    const page = await readExpired(store, cutoff, { offset: 0, limit: wanted });
    if (page.rows.length === 0) break;

    examined += page.rows.length;
    const settled = await Promise.allSettled(
      page.rows.map((row) => store.delete(ADMIN_ANALYTICS_RESOURCE, row.id)),
    );
    const failed = settled.filter((outcome) => outcome.status === "rejected");
    if (failed.length > 0) {
      throw new AdminAnalyticsError(
        `${failed.length} of ${page.rows.length} deletions failed, so ${page.rows.length - failed.length} ` +
          `rows are gone and the rest are not. The first was ${String((failed[0] as PromiseRejectedResult).reason)}. ` +
          "Running this again removes what is left, because a prune of the same cutoff removes the same rows.",
      );
    }
    removed += page.rows.length;
    more = page.total > page.rows.length;
  }

  return { days, cutoff, removed, examined, more };
}
