// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  ADMIN_ANALYTICS_MAX_EVENTS_PER_READ,
  ADMIN_ANALYTICS_PAGE_VIEW,
  AdminAnalyticsError,
  adminAnalyticsRead,
  adminAnalyticsRecord,
  adminAnalyticsRetain,
  adminAnalyticsSeries,
  adminAnalyticsSources,
  adminAnalyticsTopPaths,
} from "../src/analytics";
import type { AdminAnalyticsEvent, AdminAnalyticsSeries } from "../src/analytics";
import type { AdminPersistenceAdapter, AdminResourcePage, AdminResourceQuery } from "../src/adapters";
import { parseAdminResourceQuery } from "../src/adapters/query";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { adminChartDayRange } from "../src/charts";

/**
 * A read either covers its range or says it did not.
 *
 * The defect this file exists for was in a read that asked a store for one window and reported the
 * rows that came back. A `queryPage` answer carries the store's own count of what matched before the
 * window, so a store that hands over a short page for a large window was being read as a complete
 * range: the count fitted under the cap, the answer did not cover the range, and nothing in a
 * rendered chart says so. Forty-three tests missed it because every one of them used a store that
 * always filled the window it was given, so the only store shape under test was the one that cannot
 * exhibit it.
 *
 * The stores below are therefore built to be awkward on purpose. One hands back a hard-capped page
 * however large a window it is asked for, which is what a remote store behind a response limit does.
 * One is told to fail on its second page. One reports a count that its own rows contradict. One writes
 * a row into the range between two pages, the way a site taking traffic does. And the rows-only store,
 * which cannot exhibit any of it, is run against the same events, because the parity between the two
 * shapes is the property the defect broke.
 *
 * The clock is injected throughout, so a day boundary is a fixture rather than a wait.
 */

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CLOCK = () => NOW;
const RANGE = adminChartDayRange(4, NOW);

/**
 * Ten views, nine of them inside the range of four days, over four paths and two named sources.
 *
 * Worked out here rather than counted off a read, because a read that lost its tail would otherwise
 * be able to agree with itself: per day that is 2, 2, 3 and 2; seven distinct keys; `/` and
 * `/pricing` on three views each, `/docs` on two, `/about` on one; two sources named and four views
 * with none; and one view from August, outside the range.
 */
const NINE: AdminAnalyticsEvent[] = [
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", source: "search", at: "2026-09-27T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-7", at: "2026-09-27T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-2", source: "search", at: "2026-09-28T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", visitorKey: "v-2", source: "news", at: "2026-09-28T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", visitorKey: "v-3", source: "news", at: "2026-09-29T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", visitorKey: "v-1", source: "news", at: "2026-09-29T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/docs", visitorKey: "v-4", at: "2026-09-29T11:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/docs", visitorKey: "v-5", at: "2026-09-30T08:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/about", visitorKey: "v-6", at: "2026-09-30T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/old", visitorKey: "v-8", at: "2026-08-01T09:00:00.000Z" },
];

const IN_RANGE = 9;
const IN_RANGE_BY_DAY = [2, 2, 3, 2];
const IN_RANGE_VISITORS = 7;

/** The figure worked out from the seed, so the assertions below have something independent to say. */
function inRangeByDay(events: readonly AdminAnalyticsEvent[]): number[] {
  return RANGE.map((day) => events.filter((event) => event.at?.startsWith(day)).length);
}

/**
 * A store that returns at most `hardPage` rows however large a window it is asked for, while
 * reporting an honest total.
 *
 * The offset is honoured and the limit is not, which is the shape of a store with a response limit: it
 * will not return more rows than it is willing to send, and it will not lie about how many there are.
 */
function cappedStore(inner: Paged, hardPage: number) {
  const windows: number[] = [];
  return {
    windows,
    store: {
      ...inner,
      async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
        const asked = parseAdminResourceQuery(query);
        // Asked with no window, so the store's own paging is not what is under test. What is under
        // test is what this layer does with a short page.
        const everything = await inner.queryPage<T>(resource, { ...asked, window: undefined });
        const offset = asked.window?.offset ?? 0;
        const limit = Math.min(asked.window?.limit ?? hardPage, hardPage);
        windows.push(limit);
        return { rows: everything.rows.slice(offset, offset + limit), total: everything.total };
      },
    } satisfies AdminPersistenceAdapter,
  };
}

/**
 * A store that writes a row into the range between two pages, the way a live site does.
 *
 * `at` decides what that does to the read, which is the whole point of paging oldest first: a row
 * stamped now sorts after every page already read and leaves the prefix alone, while a row stamped
 * in the middle of the range sorts into the gap and pushes a row the offset would then step over.
 */
function storeThatGrows(inner: Paged, after: number, at: string) {
  let pages = 0;
  return {
    pages: () => pages,
    store: {
      ...inner,
      async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
        const page = await inner.queryPage<T>(resource, query);
        pages += 1;
        if (pages === after) {
          await adminAnalyticsRecord(inner, {
            kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/late", visitorKey: "v-late", at,
          });
        }
        return page;
      },
    } satisfies AdminPersistenceAdapter,
  };
}

/** A store whose count is smaller than the rows it hands over, which describes nothing. */
function incoherentStore(inner: Paged) {
  return {
    store: {
      ...inner,
      async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
        const page = await inner.queryPage<T>(resource, query);
        return { rows: page.rows, total: Math.max(0, page.rows.length - 1) };
      },
    } satisfies AdminPersistenceAdapter,
  };
}

/** A store that stops answering partway through a read, after a set number of pages. */
function storeThatFailsAfter(inner: Paged, after: number) {
  let pages = 0;
  return {
    pages: () => pages,
    store: {
      ...inner,
      async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
        pages += 1;
        if (pages > after) throw new Error("the connection was lost mid-read");
        return inner.queryPage<T>(resource, query);
      },
    } satisfies AdminPersistenceAdapter,
  };
}

type Paged = Required<Pick<AdminPersistenceAdapter, "queryPage">> & AdminPersistenceAdapter;

async function seeded(events: readonly AdminAnalyticsEvent[]): Promise<Paged> {
  const store = createMemoryPersistenceAdapter();
  for (const event of events) await adminAnalyticsRecord(store, event, { now: CLOCK });
  if (store.queryPage === undefined) throw new Error("the memory adapter is expected to page");
  return store as Paged;
}

/** The same store with `queryPage` taken away, which is the shape that cannot exhibit the defect. */
async function rowsOnly(): Promise<AdminPersistenceAdapter> {
  const inner = await seeded(NINE);
  return {
    read: inner.read,
    query: inner.query,
    create: inner.create,
    update: inner.update,
    delete: inner.delete,
  };
}

describe("a range spanning more than one page is read in full", () => {
  it("returns every event, counted against the seed rather than against what came back", async () => {
    // Stated here so the figure cannot drift with the seed. A read built from a short page of four
    // would report 4, 5 or 8, and could not produce this number by counting what it was handed.
    expect(inRangeByDay(NINE)).toEqual(IN_RANGE_BY_DAY);
    expect(IN_RANGE_BY_DAY.reduce((sum, views) => sum + views, 0)).toBe(IN_RANGE);

    const { store, windows } = cappedStore(await seeded(NINE), 4);
    const read = await adminAnalyticsRead(store, { range: RANGE });

    expect(read).toHaveLength(IN_RANGE);
    // Three pages of four, four and one, which is the cost of a store that will not send more than
    // four rows at a time. Asserted so a fix that gave up after one page could not pass.
    expect(windows).toEqual([4, 4, 4]);
  });

  it("counts the same views, and the same visitors, as a store that fills every window", async () => {
    const capped = cappedStore(await seeded(NINE), 4);
    const whole = await seeded(NINE);

    const fromCapped = await adminAnalyticsSeries(capped.store, { range: RANGE });
    const fromWhole = await adminAnalyticsSeries(whole, { range: RANGE });

    expect(fromCapped.totals.views).toBe(IN_RANGE);
    expect(fromCapped.totals.visitors).toBe(IN_RANGE_VISITORS);
    // The whole result, not the figures: a store shape that agreed on the count and disagreed on which
    // day the views fell on is the same defect wearing a different hat.
    expect(fromCapped).toEqual(fromWhole);
  });

  it("ranks the same paths from a paged store as from one that fills its window", async () => {
    const capped = cappedStore(await seeded(NINE), 4);
    const whole = await seeded(NINE);
    const top = await adminAnalyticsTopPaths(capped.store, { range: RANGE, limit: 10 });

    expect(top).toEqual(await adminAnalyticsTopPaths(whole, { range: RANGE, limit: 10 }));
    expect(await adminAnalyticsSources(capped.store, { range: RANGE, limit: 10 })).toEqual(
      await adminAnalyticsSources(whole, { range: RANGE, limit: 10 }),
    );
    // The ranking itself, from the seed: two paths on three views each, in path order because the
    // counts tie, then `/docs` on two and `/about` on one. The last view of `/` is the 28th, which is
    // the last one that happened rather than the first one a newest-first read would have filed.
    expect(top.paths).toEqual([
      { path: "/", views: 3, lastViewedAt: "2026-09-28T09:00:00.000Z" },
      { path: "/pricing", views: 3, lastViewedAt: "2026-09-29T10:00:00.000Z" },
      { path: "/docs", views: 2, lastViewedAt: "2026-09-30T08:00:00.000Z" },
      { path: "/about", views: 1, lastViewedAt: "2026-09-30T09:00:00.000Z" },
    ]);
    expect(top.total).toBe(4);
  });

  it("keeps a view written between two pages from costing the read a seeded event", async () => {
    // Nine seeded and a store capped at five, so the read takes two pages and a tenth lands between.
    // Stamped now, which is after the last day in the range, so it sorts after every page read.
    const seededIds = (await adminAnalyticsRead(await seeded(NINE), { range: RANGE })).map((row) => row.id);
    expect(seededIds).toHaveLength(IN_RANGE);
    const growing = storeThatGrows(await seeded(NINE), 1, "2026-10-01T09:00:00.000Z");
    const { store } = cappedStore(growing.store, 5);

    const read = await adminAnalyticsRead(store, { range: RANGE });

    // Every seeded row is present, by identity rather than by count. A read that dropped one and
    // picked up the late row would still hold nine rows and still hold every path, so counting and
    // checking the paths would both pass on a read that had lost an event.
    expect(growing.pages()).toBeGreaterThan(1);
    for (const id of seededIds) {
      expect(read.map((row) => row.id)).toContain(id);
    }
    expect(new Set(read.map((row) => row.id)).size).toBe(read.length);
    // Nine seeded plus at most the one written mid-read, and that one is in the range on the 1st.
    expect(read.length).toBeGreaterThanOrEqual(IN_RANGE);
    expect(read.length).toBeLessThanOrEqual(IN_RANGE + 1);
  });

  it("refuses rather than returning a set that stepped over an event", async () => {
    // The same read with the late row stamped in the middle of the range, so it sorts into the gap
    // between the two pages and shifts the rows behind it.
    const growing = storeThatGrows(await seeded(NINE), 1, "2026-09-29T05:00:00.000Z");
    const { store } = cappedStore(growing.store, 5);

    // A duplicate id is the store saying the offset moved, and a set with a repeat in it is missing a
    // row. Nine views where eight belong is the same defect as four where nine belong.
    await expect(adminAnalyticsRead(store, { range: RANGE })).rejects.toThrow(/stepped over/);
  });

  it("refuses a store whose count is smaller than the rows beside it", async () => {
    const { store } = incoherentStore(await seeded(NINE));
    await expect(adminAnalyticsRead(store, { range: RANGE })).rejects.toThrow(
      /do not describe the range/,
    );
  });

  it("raises rather than answering, when the store stops partway through", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);
    const failing = storeThatFailsAfter(store, 1);

    // No partial answer: the first page was in hand and the call still did not return a number.
    await expect(adminAnalyticsSeries(failing.store, { range: RANGE })).rejects.toThrow(
      "the connection was lost mid-read",
    );
  });
});

describe("a range larger than the cap refuses, and says which cap", () => {
  it("names ADMIN_ANALYTICS_MAX_EVENTS_PER_READ rather than returning the first page", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);
    const tooSmall = { range: RANGE, maxEvents: 5 };

    const refusal = adminAnalyticsRead(store, tooSmall);
    await expect(refusal).rejects.toBeInstanceOf(AdminAnalyticsError);
    await expect(refusal).rejects.toThrow(/at most 5 \(ADMIN_ANALYTICS_MAX_EVENTS_PER_READ\)/);
    // The refusal quotes the store's own count of nine, not the four rows that arrived.
    await expect(refusal).rejects.toThrow(new RegExp(`that range holds ${IN_RANGE} events`));
  });

  it("refuses a cap the query contract itself would refuse", async () => {
    const store = await seeded(NINE);
    await expect(adminAnalyticsRead(store, { maxEvents: ADMIN_ANALYTICS_MAX_EVENTS_PER_READ + 1 })).rejects.toThrow(
      /query contract/,
    );
  });

  it("names the cap through the series and the rankings, which are where a number would be shown", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);
    const over = { range: RANGE, maxEvents: 5 };

    await expect(adminAnalyticsSeries(store, over)).rejects.toThrow(/ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/);
    await expect(adminAnalyticsTopPaths(store, { ...over, limit: 3 })).rejects.toThrow(
      /ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/,
    );
    await expect(adminAnalyticsSources(store, { ...over, limit: 3 })).rejects.toThrow(
      /ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/,
    );
  });

  it("still serves a range that exactly fills the cap", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);
    expect(await adminAnalyticsRead(store, { range: RANGE, maxEvents: IN_RANGE })).toHaveLength(IN_RANGE);
  });
});

describe("a partial answer is not representable", () => {
  /**
   * The result types carry every figure as a plain number, so there is no state in which one of them
   * is absent and a caller renders the rest.
   *
   * This is a type-level assertion on purpose. The way a partial answer comes back is a field the
   * type admits, and a runtime test cannot see a type admit it. `undefined extends T` is how a field
   * that admits "no value" is caught, and the tuple below stops compiling the moment one does.
   */
  type Whole<T> = undefined extends T ? false : true;
  type Point = AdminAnalyticsSeries["points"][number];
  type Totals = AdminAnalyticsSeries["totals"];
  const shape: {
    pointViews: Point["views"];
    totalsViews: Totals["views"];
    totalsVisitors: Totals["visitors"];
    totalsUnattributed: Totals["unattributed"];
  } = { pointViews: 0, totalsViews: 0, totalsVisitors: 0, totalsUnattributed: 0 };
  const whole: [
    Whole<typeof shape.pointViews>,
    Whole<typeof shape.totalsViews>,
    Whole<typeof shape.totalsVisitors>,
    Whole<typeof shape.totalsUnattributed>,
  ] = [true, true, true, true];

  it("types every figure as a number, with no optional among them", () => {
    // The check that matters is the one above this line: making any of the four optional turns
    // `Whole` false and the tuple stops compiling. Asserted at runtime as well, so the file reports a
    // failure rather than only failing to build.
    expect(whole).toEqual([true, true, true, true]);
    expect(shape).toEqual({ pointViews: 0, totalsViews: 0, totalsVisitors: 0, totalsUnattributed: 0 });
  });

  it("has no way to hold a partial range: the read either returns the rows or throws", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);

    // Both halves in one test, because a type that admits undefined and a read that returns half a
    // range are the same defect, and either alone would pass.
    const settled = await adminAnalyticsSeries(store, { range: RANGE, maxEvents: 5 }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    expect(settled.ok).toBe(false);
    // Nothing came back to render, so there is no number on a tile reading "4 of 9".
    expect(settled).not.toHaveProperty("value");
  });
});

describe("a store that does not page gives the same answer as one that does", () => {
  it("answers the series identically, with no queryPage on the store at all", async () => {
    const plain = await rowsOnly();
    const paged = await seeded(NINE);
    expect("queryPage" in plain).toBe(false);

    expect(await adminAnalyticsRead(plain, { range: RANGE })).toEqual(
      await adminAnalyticsRead(paged, { range: RANGE }),
    );
    expect(await adminAnalyticsSeries(plain, { range: RANGE })).toEqual(
      await adminAnalyticsSeries(paged, { range: RANGE }),
    );
    // And identical to the store that fills every window, which is the third shape.
    expect(await adminAnalyticsSeries(plain, { range: RANGE })).toEqual(
      await adminAnalyticsSeries(cappedStore(await seeded(NINE), 4).store, { range: RANGE }),
    );
  });

  it("answers the rankings the same from both shapes", async () => {
    const plain = await rowsOnly();
    const paged = await seeded(NINE);

    expect(await adminAnalyticsTopPaths(plain, { range: RANGE, limit: 2 })).toEqual(
      await adminAnalyticsTopPaths(paged, { range: RANGE, limit: 2 }),
    );
    expect(await adminAnalyticsSources(plain, { range: RANGE, limit: 2 })).toEqual(
      await adminAnalyticsSources(paged, { range: RANGE, limit: 2 }),
    );
  });

  it("prunes the same rows from both shapes, across more than one page", async () => {
    const plain = await rowsOnly();
    const paged = cappedStore(await seeded(NINE), 2);

    // A two-day window leaves the two 27ths, the two 28ths and the August view outside it.
    expect(await adminAnalyticsRetain(plain, { days: 2, now: CLOCK })).toEqual(
      await adminAnalyticsRetain(paged.store, { days: 2, now: CLOCK }),
    );
    expect((await adminAnalyticsRead(plain)).map((row) => row.occurred_at)).toEqual(
      (await adminAnalyticsRead(paged.store)).map((row) => row.occurred_at),
    );
    // Five removed and five left, which is the figure from the seed rather than from a read.
    expect(await adminAnalyticsRead(plain)).toHaveLength(5);
  });

  it("returns the same rows in the same order, which is what makes the ranking store-independent", async () => {
    const plain = await rowsOnly();
    const capped = cappedStore(await seeded(NINE), 4);

    // Newest first, so the first row filed into a path's bucket is that path's most recent view.
    expect((await adminAnalyticsRead(capped.store, { range: RANGE })).map((row) => row.occurred_at)).toEqual(
      (await adminAnalyticsRead(plain, { range: RANGE })).map((row) => row.occurred_at),
    );
  });
});

describe("the properties the paging had to keep", () => {
  it("keeps an event outside the range in neither the points nor the totals", async () => {
    const { store } = cappedStore(await seeded(NINE), 4);
    const series = await adminAnalyticsSeries(store, { range: RANGE });

    // Ten seeded and nine in the range, with the tenth on the first day of August.
    expect(series.totals.views).toBe(IN_RANGE);
    expect(series.points.map((point) => point.views)).toEqual(IN_RANGE_BY_DAY);
    expect(series.points.reduce((sum, point) => sum + point.views, 0)).toBe(IN_RANGE);
    expect(series.points.map((point) => point.key)).toEqual(RANGE);
  });

  it("keeps an unkeyed event a view and no visitor, across a paged read", async () => {
    const events: AdminAnalyticsEvent[] = [
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: null, at: "2026-09-28T09:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", at: "2026-09-28T10:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", at: "2026-09-29T10:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", at: "2026-09-30T10:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-2", at: "2026-09-30T11:00:00.000Z" },
    ];
    const { store } = cappedStore(await seeded(events), 2);
    const series = await adminAnalyticsSeries(store, { range: RANGE });

    // Five views, two real keys, and the one event with no key attributed to nobody.
    expect(series.totals.views).toBe(5);
    expect(series.totals.visitors).toBe(2);
    expect(series.totals.unattributed).toBe(1);
    // v-1 is on three of the four days and v-2 shares the last, so the days read 0, 1, 1, 2 and the
    // range total is 2 rather than the 4 the days add to.
    expect(series.points.map((point) => point.visitors)).toEqual([0, 1, 1, 2]);
  });

  it("keeps retention taking the rows outside the window and leaving the ones inside", async () => {
    const events: AdminAnalyticsEvent[] = [
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", at: "2026-09-18T12:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", at: "2026-09-19T23:59:59.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", at: "2026-09-20T12:00:00.000Z" },
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", at: "2026-09-29T12:00:00.000Z" },
    ];
    // A page of two, so the prune has to take three passes to reach the rows inside the window.
    const { store } = cappedStore(await seeded(events), 2);
    const result = await adminAnalyticsRetain(store, { days: 10, now: CLOCK });

    // The comparison is exclusive of the cutoff, so the row stamped exactly on it is inside the window.
    expect(result.cutoff).toBe("2026-09-20T12:00:00.000Z");
    expect(result.removed).toBe(2);
    expect(result.more).toBe(false);
    expect((await adminAnalyticsRead(store)).map((row) => row.occurred_at).sort()).toEqual([
      "2026-09-20T12:00:00.000Z",
      "2026-09-29T12:00:00.000Z",
    ]);
  });
});
