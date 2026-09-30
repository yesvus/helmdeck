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
 * paged one, and that read **pages until the range is covered or the cap is reached, and refuses
 * rather than answering from a partial range**. Thirty points built from the first thousand views of a
 * month is a chart reporting the month as those thousand views, and a chart cannot show that anything
 * is missing, which is why there is no way to ask for one. Past the cap the answer is a store that
 * sums in SQL, and until a host has one this is the whole of it.
 */

import { adminAggregate } from "../aggregate/aggregate.js";
import { adminChartDayKey } from "../charts/series.js";
import { ADMIN_RESOURCE_MAX_LIMIT, type AdminResourceFilter } from "../adapters/query.js";
import type { AdminPersistenceAdapter } from "../adapters/host.js";
import { ADMIN_ANALYTICS_RESOURCE, AdminAnalyticsError, type AdminAnalyticsEventRow } from "./events.js";

/**
 * The most events one read may return, across every page it takes to cover a range.
 *
 * The query contract's own window cap rather than a figure of its own, and the coupling is
 * deliberate: the number a store will serve in one window is the number this must not pretend to
 * exceed, and a cap the two could disagree about would be a cap nobody could reason about. It is
 * therefore the ceiling on a whole answer, not on one round trip, and the read pages up to it.
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
 * The events a range covers, newest first, or a refusal.
 *
 * The bounds are pushed down so a store with a paged query never reads the rest of the table, and
 * then applied again through `adminChartDayKey` on the rows that came back, so a store that has no
 * paged query and one that does return the same set rather than two answers to one question.
 *
 * A store with a paged query is read **page by page until the range is covered**, because asking for
 * one window the size of the cap and reading one page back is how a range silently loses its tail: a
 * store is free to return fewer rows than the window asked for, and one that does so hands over a
 * total that fits under the cap along with a page that does not cover it. Both are counted here and
 * the answer is refused unless they agree. A store that keeps answering with rows, or reports a total
 * its rows contradict, stops the read rather than looping on a store that will never cover it.
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

  if (store.queryPage !== undefined) {
    return pageThrough(store.queryPage, { filters, within, limit });
  }

  // A store with no paged query is read whole, and the whole read is paid before the refusal below
  // rather than avoided by it. That is the cost of not having opted into `queryPage`, and it is the
  // reason the refusal is worth a host's attention rather than a shrug.
  const all = await store.query<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE);
  const rows = all
    .filter(within)
    .filter((row) => (options.kind === undefined ? true : row.kind === options.kind))
    .sort(newestFirst);
  if (rows.length > limit) oversize(rows.length, limit);
  return rows;
}

type PageThrough = {
  filters: readonly AdminResourceFilter[];
  within: (row: AdminAnalyticsEventRow) => boolean;
  limit: number;
};

/**
 * Every row a query matches, in as many pages as that takes, or a refusal.
 *
 * The refusal is the point. A `queryPage` answer carries the store's own count of what matched before
 * the window, so a short page against a larger total is a store saying "there is more than I am
 * showing you", and reporting the page as if it were the range is the one answer a host cannot detect
 * from a rendered chart.
 *
 * Paged **oldest first**, and the id breaks the tie, because that is the only order in which paging
 * by offset can be made safe while the table is being written to. A row written during the read
 * carries the moment it was written, which is the newest, so it lands after everything already read
 * and leaves the prefix intact. A row written with a *backdated* moment sorts into the middle instead,
 * shifting the rows behind it and making the offset step over one, and that arrives as an id seen
 * twice. It is refused rather than absorbed, because a set with a repeat in it is missing a row and
 * nothing downstream could tell.
 *
 * The first page's total is what this read aims to cover, so the answer is the range as it stood when
 * the read began, plus anything that arrived afterwards and sorted after it. The rows go back into
 * newest-first order at the end, so this and the rows-only path return the same sequence and a
 * ranking cannot depend on which store shape the host has.
 */
async function pageThrough(
  queryPage: NonNullable<AdminPersistenceAdapter["queryPage"]>,
  { filters, within, limit }: PageThrough,
): Promise<AdminAnalyticsEventRow[]> {
  const collected: AdminAnalyticsEventRow[] = [];
  const seen = new Set<string>();
  const oldest = [
    { field: OCCURRED_AT, direction: "asc" as const },
    { field: "id", direction: "asc" as const },
  ];
  let offset = 0;
  let target = 0;

  for (;;) {
    const window = Math.min(ADMIN_RESOURCE_MAX_LIMIT, limit - collected.length);
    if (window < 1) break;

    const page = await queryPage<AdminAnalyticsEventRow>(ADMIN_ANALYTICS_RESOURCE, {
      filter: filters.length > 0 ? [...filters] : undefined,
      sort: oldest,
      window: { offset, limit: window },
    });

    // A count smaller than the page beside it describes nothing, so nothing says which rows were left
    // out. Refusing is the honest answer and picking is not available.
    if (page.total < page.rows.length) refuseIncoherent(page.rows.length, page.total);
    // A count above what a read may return is the refusal this function exists for, taken from the
    // store's own number rather than from the rows that happened to arrive.
    if (page.total > limit) oversize(page.total, limit);
    if (target === 0) target = page.total;

    for (const row of page.rows) {
      if (seen.has(row.id)) refuseMoved();
      seen.add(row.id);
    }
    collected.push(...page.rows);

    if (collected.length >= target) return collected.filter(within).sort(newestFirst);
    if (page.rows.length === 0) break;
    offset += page.rows.length;
  }

  oversize(target > collected.length ? target : collected.length, limit);
}

function refuseMoved(): never {
  throw new AdminAnalyticsError(
    "an event arrived between two pages of this read with a moment older than the pages already read, " +
      "so the range shifted under the offset and at least one event was stepped over. Read a range that " +
      "is closed, such as one ending yesterday, or a store that can serve the range in one window.",
  );
}

/** Newest first, with the id breaking the tie so two events on one moment hold still. */
function newestFirst(left: AdminAnalyticsEventRow, right: AdminAnalyticsEventRow): number {
  return right.occurred_at.localeCompare(left.occurred_at) || left.id.localeCompare(right.id);
}

function refuseIncoherent(rows: number, total: number): never {
  throw new AdminAnalyticsError(
    `the store reported ${total} events and handed over ${rows} of them, so the rows it returned do ` +
      "not describe the range, and neither a count nor a ranking can be built from rows whose place in " +
      "it is unknown.",
  );
}

function oversize(found: number, limit: number): never {
  throw new AdminAnalyticsError(
    `that range holds ${found} events and one read returns at most ${limit} (` +
      "ADMIN_ANALYTICS_MAX_EVENTS_PER_READ). Narrow the range, or give the host a store that sums " +
      "in SQL, because a chart built from the first rows of a range is a chart reporting the range as " +
      "those rows, and nothing on that chart would say so.",
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
    // A count smaller than the rows beside it is a store that cannot answer, and this one is read
    // again from the start, so taking the page would delete rows whose place in the range is unknown.
    if (page.total < page.rows.length) refuseIncoherent(page.rows.length, page.total);
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
  // the time the next one is asked for, and an offset would step over whatever replaced them. The
  // total falls as the loop goes, which is the point rather than a store moving under the read, so
  // the coherence check on the way out is the only one that applies here.
  while (removed < limit) {
    const wanted = Math.min(ADMIN_ANALYTICS_MAX_EVENTS_PER_READ, limit - removed);
    const page = await readExpired(store, cutoff, { offset: 0, limit: wanted });
    if (page.rows.length === 0) {
      // Rows left behind by a store that counts them and will not hand them over. Reported rather
      // than reported as a clean table, which is what a zero-length page with a non-zero total
      // otherwise reads as.
      more = page.total > 0;
      break;
    }

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
