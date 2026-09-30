// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  ADMIN_ANALYTICS_PAGE_VIEW,
  ADMIN_ANALYTICS_RESOURCE,
  AdminAnalyticsError,
  adminAnalyticsEventValue,
  adminAnalyticsRead,
  adminAnalyticsRecord,
  adminAnalyticsRetain,
  adminAnalyticsSeries,
  adminAnalyticsSources,
  adminAnalyticsTopPaths,
} from "../src/analytics";
import { adminChartDayRange } from "../src/charts";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import type { AdminPersistenceAdapter } from "../src/adapters";
import type { AdminAnalyticsEvent, AdminAnalyticsEventRow } from "../src/analytics";

/**
 * A captured event, written through the adapter and read back, counted.
 *
 * Every event here goes in through `create` and comes out through `queryPage`, so the storage shape
 * is what is under test rather than a direct call between two functions in one process. That is the
 * difference between this layer and a pair of pure functions: a column named `visitor_key` in the
 * layer and `visitorKey` in the event would agree in memory and put every row in `unkeyed` on the
 * first read, and nothing but a round trip would say so.
 *
 * The clock is injected throughout, so a day boundary is a fixture rather than a wait.
 */

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CLOCK = () => NOW;

/** The two shipped stores, so every property is checked against the storage shape and not a fake. */
function stores(): [string, AdminPersistenceAdapter][] {
  return [
    ["memory", createMemoryPersistenceAdapter()],
    ["sqlite", createSqlitePersistenceAdapter({ url: "file::memory:" })],
  ];
}

async function recordAll(store: AdminPersistenceAdapter, events: readonly AdminAnalyticsEvent[]) {
  for (const event of events) await adminAnalyticsRecord(store, event, { now: CLOCK });
}

/** Four days ending on the 30th, which is where every event below lands. */
const RANGE = adminChartDayRange(4, NOW);

function view(over: Partial<AdminAnalyticsEvent> = {}): AdminAnalyticsEvent {
  return { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", ...over };
}

describe("an event written through the store is counted by the query", () => {
  it("lands on the row shape the read expects, and reads back as itself", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ visitorKey: "v-1", source: "newsletter", at: "2026-09-29T08:00:00.000Z" }),
      ]);

      const rows = await adminAnalyticsRead(store, { range: RANGE });
      expect(rows, name).toHaveLength(1);

      const row = rows[0]!;
      // The key verbatim, not a hash of it and not a blank standing in for it: a layer that quietly
      // derived one would make this the only assertion that could tell.
      expect(row.visitor_key, name).toBe("v-1");
      expect(row.kind, name).toBe(ADMIN_ANALYTICS_PAGE_VIEW);
      expect(row.path, name).toBe("/pricing");
      expect(row.source, name).toBe("newsletter");
      expect(row.occurred_at, name).toBe("2026-09-29T08:00:00.000Z");
      expect(typeof row.id, name).toBe("string");
      expect(row.id.length, name).toBeGreaterThan(0);
    }
  });

  it("is counted on the day it happened, with a zero for each day around it", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ at: "2026-09-28T09:00:00.000Z" }),
        view({ at: "2026-09-28T10:00:00.000Z" }),
        view({ at: "2026-09-29T01:00:00.000Z" }),
      ]);

      const series = await adminAnalyticsSeries(store, { range: RANGE });
      // Four real days, two of them with views on them, which is the rule a chart drawn from the
      // rows alone would break by leaving the 27th out.
      expect(series.points.map((point) => point.key), name).toEqual([
        "2026-09-27",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
      ]);
      expect(series.points.map((point) => point.views), name).toEqual([0, 2, 1, 0]);
      expect(series.totals.views, name).toBe(3);
    }
  });

  it("leaves an event outside the range in neither the points nor the totals", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ at: "2026-09-28T09:00:00.000Z" }),
        // Before the range and after it.
        view({ at: "2026-09-01T09:00:00.000Z" }),
        view({ at: "2026-10-05T09:00:00.000Z" }),
      ]);
      // Written straight into the table rather than through the recorder, because a row carrying no
      // moment is one this layer refuses to write and one a query still has to cope with: a host
      // that seeded the table itself, or a row from before the layer existed.
      await store.create(ADMIN_ANALYTICS_RESOURCE, {
        kind: ADMIN_ANALYTICS_PAGE_VIEW,
        path: "/pricing",
        visitor_key: "v-1",
        source: null,
        occurred_at: "not a moment",
      });

      const ranged = await adminAnalyticsSeries(store, { range: RANGE });
      // The range is enforced at the read, so the two events outside it are never handed to the
      // aggregation: in no point, and not in the total the tile reads aloud beside the chart.
      expect(ranged.totals.views, name).toBe(1);
      expect(ranged.points.reduce((sum, point) => sum + point.views, 0), name).toBe(1);
      expect(ranged.points.map((point) => point.views), name).toEqual([0, 1, 0, 0]);

      // Read with no range, the unplaceable row comes back and the aggregation reports it rather
      // than leaving the host to believe its table holds three events.
      const unbounded = await adminAnalyticsSeries(store, { kind: ADMIN_ANALYTICS_PAGE_VIEW });
      expect(unbounded.totals.views, name).toBe(3);
      expect(unbounded.totals.unkeyed, name).toBe(1);
    }
  });
});

describe("what a visitor key decides, and what it refuses to decide", () => {
  it("counts two views by one key as two views and one visitor, and two keys as two", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ visitorKey: "v-1", at: "2026-09-29T09:00:00.000Z" }),
        view({ visitorKey: "v-1", at: "2026-09-29T10:00:00.000Z" }),
        view({ visitorKey: "v-2", at: "2026-09-29T11:00:00.000Z" }),
      ]);

      const series = await adminAnalyticsSeries(store, { range: RANGE });
      const day = series.points.find((point) => point.key === "2026-09-29")!;

      expect(day.views, name).toBe(3);
      expect(day.visitors, name).toBe(2);
      expect(series.totals.views, name).toBe(3);
      expect(series.totals.visitors, name).toBe(2);
      // Nothing here was unattributed, which is the half of the answer that is easy to forget.
      expect(series.totals.unattributed, name).toBe(0);
    }
  });

  it("counts one visitor once across three days rather than three times", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ visitorKey: "v-1", at: "2026-09-28T09:00:00.000Z" }),
        view({ visitorKey: "v-1", at: "2026-09-29T09:00:00.000Z" }),
        view({ visitorKey: "v-1", at: "2026-09-30T09:00:00.000Z" }),
      ]);

      const series = await adminAnalyticsSeries(store, { range: RANGE });

      // Three views and three days each with a visitor on it, but one person. A total that summed
      // the points would read 3 here, which is the number a host would then put in a tile.
      expect(series.points.map((point) => point.visitors), name).toEqual([0, 1, 1, 1]);
      expect(series.totals.visitors, name).toBe(1);
      expect(series.totals.views, name).toBe(3);
    }
  });

  it("counts an event with no key as a view and no visitor, and names the gap", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        view({ visitorKey: null, at: "2026-09-29T09:00:00.000Z" }),
        view({ at: "2026-09-29T10:00:00.000Z" }),
        // A blank is the same absence: an expired cookie is a blank rather than an absent key.
        view({ visitorKey: "   ", at: "2026-09-29T11:00:00.000Z" }),
        view({ visitorKey: "v-1", at: "2026-09-29T12:00:00.000Z" }),
      ]);

      const series = await adminAnalyticsSeries(store, { range: RANGE });
      const day = series.points.find((point) => point.key === "2026-09-29")!;

      // Every one of the four is a view, so a host's traffic figure survives a host that has decided
      // not to identify anybody.
      expect(day.views, name).toBe(4);
      // And the unique count is the one real key, not four and not one. Counting them all as one
      // visitor would report 1 for a day four people arrived on; counting each as its own would
      // report 4 and make "unique" a synonym for "views". Both are wrong and the second is worse,
      // because it is the only one that looks like a working feature.
      expect(day.visitors, name).toBe(1);
      expect(day.unattributed, name).toBe(3);
      expect(series.totals.unattributed, name).toBe(3);
      expect(series.totals.visitors, name).toBe(1);
    }
  });

  it("writes no row at all for an unkeyed event when the host has said not to", async () => {
    for (const [name, store] of stores()) {
      const dropped = await adminAnalyticsRecord(store, view(), { now: CLOCK, unkeyed: "drop" });
      expect(dropped, name).toBeNull();

      await adminAnalyticsRecord(
        store,
        view({ visitorKey: "v-1" }),
        { now: CLOCK, unkeyed: "drop" },
      );

      const rows = await adminAnalyticsRead(store, { range: RANGE });
      expect(rows, name).toHaveLength(1);
      expect(rows[0]!.visitor_key, name).toBe("v-1");
    }
  });
});

describe("what a read refuses rather than cutting short", () => {
  it("refuses a range holding more events than one read may return", async () => {
    const store = createMemoryPersistenceAdapter();
    for (let index = 0; index < 5; index += 1) {
      await adminAnalyticsRecord(store, view({ at: "2026-09-29T09:00:00.000Z" }), { now: CLOCK });
    }

    await expect(adminAnalyticsRead(store, { range: RANGE, maxEvents: 3 })).rejects.toBeInstanceOf(
      AdminAnalyticsError,
    );
    await expect(adminAnalyticsRead(store, { range: RANGE, maxEvents: 3 })).rejects.toThrow(
      /holds 5 events and one read returns at most 3/,
    );
  });

  it("refuses a read cap the query contract itself would refuse", async () => {
    const store = createMemoryPersistenceAdapter();
    await expect(adminAnalyticsRead(store, { maxEvents: 100_000 })).rejects.toThrow(/query contract/);
  });

  it("refuses a range that is not days, rather than guessing which moments it covers", async () => {
    const store = createMemoryPersistenceAdapter();
    await expect(adminAnalyticsRead(store, { range: ["2026-09"] })).rejects.toThrow(/adminChartDayRange/);
  });
});

describe("retention removes what it says and keeps what is inside the window", () => {
  it("drops the events before the cutoff and keeps the ones from the boundary on", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, [
        // Two days before the cutoff, the cutoff itself, a second after it, and yesterday.
        view({ at: "2026-09-18T12:00:00.000Z" }),
        view({ at: "2026-09-19T23:59:59.000Z" }),
        view({ at: "2026-09-20T12:00:00.000Z" }),
        view({ at: "2026-09-20T12:00:01.000Z" }),
        view({ at: "2026-09-29T12:00:00.000Z" }),
      ]);

      const result = await adminAnalyticsRetain(store, { days: 10, now: CLOCK });

      // The comparison is exclusive of the cutoff, so the row stamped exactly on it is inside the
      // window and stays. That is the boundary a host checks by hand, so it is the one asserted.
      expect(result.cutoff, name).toBe("2026-09-20T12:00:00.000Z");
      expect(result.removed, name).toBe(2);
      expect(result.examined, name).toBe(2);
      expect(result.more, name).toBe(false);

      const kept = (await adminAnalyticsRead(store)).map((row) => row.occurred_at).sort();
      expect(kept, name).toEqual([
        "2026-09-20T12:00:00.000Z",
        "2026-09-20T12:00:01.000Z",
        "2026-09-29T12:00:00.000Z",
      ]);
    }
  });

  it("refuses a window of no days rather than keeping nothing or keeping everything", async () => {
    const store = createMemoryPersistenceAdapter();
    await recordAll(store, [view({ at: "2026-09-29T12:00:00.000Z" })]);

    for (const days of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(adminAnalyticsRetain(store, { days, now: CLOCK })).rejects.toThrow(/positive number of days/);
    }
    // A refusal removed nothing, which is the other half of "does not take down the page".
    expect(await adminAnalyticsRead(store)).toHaveLength(1);
  });

  it("says there is more when it stops at its limit, and drains the rest on the next call", async () => {
    const store = createMemoryPersistenceAdapter();
    for (let day = 1; day <= 5; day += 1) {
      await adminAnalyticsRecord(store, view({ at: `2026-09-2${day}T09:00:00.000Z` }), { now: CLOCK });
    }

    const first = await adminAnalyticsRetain(store, { days: 3, now: CLOCK, maxRemovals: 2 });
    expect(first.removed).toBe(2);
    expect(first.more).toBe(true);

    const second = await adminAnalyticsRetain(store, { days: 3, now: CLOCK });
    expect(second.removed).toBe(3);
    expect(second.more).toBe(false);
    expect(await adminAnalyticsRead(store)).toHaveLength(0);
  });
});

describe("what a host writes to record an event, and the values it may write", () => {
  it("stamps an event without a moment from the injected clock", () => {
    const value = adminAnalyticsEventValue(view({ visitorKey: "v-1" }), { now: CLOCK });
    expect(value.occurred_at).toBe("2026-09-30T12:00:00.000Z");
    expect(value.visitor_key).toBe("v-1");
  });

  it("normalises a moment carrying an offset to the UTC instant it names", () => {
    const value = adminAnalyticsEventValue(view({ at: "2026-09-30T14:00:00+02:00" }), { now: CLOCK });
    expect(value.occurred_at).toBe("2026-09-30T12:00:00.000Z");
  });

  it("refuses a moment it cannot place, rather than storing a row no range can include", () => {
    // A local time with no offset is the one that matters: a server an hour out would file every
    // view on the wrong day and the chart would agree with itself throughout.
    expect(() => adminAnalyticsEventValue(view({ at: "2026-09-30 12:00:00" }))).toThrow(
      /not a moment/,
    );
    expect(() => adminAnalyticsEventValue(view({ at: "" }))).toThrow(/at is blank/);
  });

  it("refuses an event with nothing to group it by", () => {
    expect(() => adminAnalyticsEventValue(view({ kind: "  " }))).toThrow(/kind is missing/);
    expect(() => adminAnalyticsEventValue(view({ path: "" }))).toThrow(/path is missing/);
  });

  it("refuses a field longer than the table holds rather than shortening it", () => {
    const long = `/${"segment/".repeat(200)}`;
    expect(() => adminAnalyticsEventValue(view({ path: long }))).toThrow(/above the 512/);
  });
});

/** The three answers a dashboard reads beside its chart, and what each one leaves out. */
describe("top paths and sources over the events that were captured", () => {
  const EVENTS: AdminAnalyticsEvent[] = [
    view({ path: "/", visitorKey: "v-1", source: "newsletter", at: "2026-09-27T09:00:00.000Z" }),
    view({ path: "/", visitorKey: "v-2", source: "newsletter", at: "2026-09-28T09:00:00.000Z" }),
    view({ path: "/pricing", visitorKey: "v-2", source: "search", at: "2026-09-29T09:00:00.000Z" }),
    view({ path: "/pricing", visitorKey: "v-3", at: "2026-09-29T10:00:00.000Z" }),
    { kind: "signup", path: "/signup", visitorKey: "v-3", source: "search", at: "2026-09-29T11:00:00.000Z" },
  ];

  it("ranks paths by views and reports when each was last looked at", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, EVENTS);
      const top = await adminAnalyticsTopPaths(store, { limit: 2 });

      expect(top.paths.map((entry) => entry.path), name).toEqual(["/", "/pricing"]);
      expect(top.paths[0]!.views, name).toBe(2);
      // The newest view of the home page, which is the second day it appears on rather than the
      // first. Taking the first row a bucket took would report the 27th and be quietly wrong.
      expect(top.paths[0]!.lastViewedAt, name).toBe("2026-09-28T09:00:00.000Z");
      expect(top.paths[1]!.lastViewedAt, name).toBe("2026-09-29T10:00:00.000Z");
      // Three paths in the range and a limit of two, so the count is the count and not the list.
      expect(top.total, name).toBe(3);
    }
  });

  it("ranks sources and reports the views that named none", async () => {
    for (const [name, store] of stores()) {
      await recordAll(store, EVENTS);
      const sources = await adminAnalyticsSources(store, { limit: 10, label: (s) => s.toUpperCase() });

      expect(sources.sources, name).toEqual([
        { source: "newsletter", label: "NEWSLETTER", views: 2 },
        { source: "search", label: "SEARCH", views: 2 },
      ]);
      expect(sources.total, name).toBe(2);
      // The one view with no referrer behind it. Counting it as a source would put "direct" in a
      // list and imply the host knew it was direct, which is not the same claim.
      expect(sources.unattributed, name).toBe(1);
    }
  });

  it("holds both answers to the same events on both stores", async () => {
    const answers = new Map<string, unknown>();
    for (const [name, store] of stores()) {
      await recordAll(store, EVENTS);
      answers.set(
        name,
        await adminAnalyticsTopPaths(store, { limit: 2 }).then(async (top) => ({
          top,
          sources: await adminAnalyticsSources(store, { limit: 10 }),
          series: await adminAnalyticsSeries(store, { range: RANGE }),
        })),
      );
    }
    expect(answers.get("sqlite")).toEqual(answers.get("memory"));
  });

  it("keeps the rows a query reads free of a kind it was not asked about", async () => {
    const store = createMemoryPersistenceAdapter();
    await recordAll(store, EVENTS);

    const views = await adminAnalyticsSeries(store, { range: RANGE, kind: ADMIN_ANALYTICS_PAGE_VIEW });
    const signups = await adminAnalyticsSeries(store, { range: RANGE, kind: "signup" });

    expect(views.totals.views).toBe(4);
    expect(signups.totals.views).toBe(1);
  });
});

describe("the resource name the rows live under", () => {
  it("is the one the demo's store is allowed to talk to", async () => {
    expect(ADMIN_ANALYTICS_RESOURCE).toBe("analytics_events");
    const store = createMemoryPersistenceAdapter();
    await adminAnalyticsRecord(store, view(), { now: CLOCK });
    const rows: AdminAnalyticsEventRow[] = await store.query(ADMIN_ANALYTICS_RESOURCE);
    expect(rows).toHaveLength(1);
  });
});
