// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  ADMIN_ANALYTICS_MAX_EVENTS_PER_READ,
  ADMIN_ANALYTICS_PAGE_VIEW,
  ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS,
  ADMIN_ANALYTICS_REPORT_MAX_ROWS,
  ADMIN_ANALYTICS_REPORT_SECTIONS,
  AdminAnalyticsError,
  adminAnalyticsRead,
  adminAnalyticsRecord,
  adminAnalyticsReport,
  adminAnalyticsReportFigures,
  adminAnalyticsReportResponse,
  adminAnalyticsSeries,
  adminAnalyticsSources,
  adminAnalyticsTopPaths,
  adminResourceExportResponse,
} from "@yesvus/helmdeck";
import type { AdminAnalyticsEvent, AdminAnalyticsReportFigures, AdminAnalyticsReportTotals } from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import { adminChartDayRange } from "../src/charts";
import { ADMIN_ANALYTICS_REPORT_COLUMNS, analyticsReportHeader } from "../src/analytics-export/format";
import type { AdminAnalyticsReportRow } from "../src/analytics-export/format";
import type { AdminPersistenceAdapter } from "../src/adapters";

/**
 * A report has to add up to itself, has to say what it left out, and has to be a file nobody can
 * mistake for a month of traffic it did not hold.
 *
 * The three failures this file exists for are the three ways a report misrepresents itself, and each
 * one is invisible from the outside. Totals that disagree with the rows above them look like a
 * rounding rule. A path a role may not read looks like a path. A range where the permission policy
 * withheld everything looks like a quiet week. So the assertions here are mostly about the *file's own
 * text* rather than about the object the call returned, because the object is what the writer believed
 * and the text is what a person receives.
 *
 * The figures are worked out from the seed below rather than pasted from a previous run, and the
 * reconciliations are asserted against each other rather than against a hardcoded number wherever a
 * reconciliation is what is being checked. A test that pinned `3` where a sum belongs would keep
 * passing after the sum stopped being true.
 *
 * The clock is injected throughout, so a day boundary is a fixture rather than a wait, and no case
 * sleeps.
 */

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CLOCK = () => NOW;
const RANGE = adminChartDayRange(4, NOW);

/** The path a policy refuses in the cases that need one, and which therefore never reaches a file. */
const PRIVATE = "/admin/billing";

/**
 * Ten views over four days, four public paths and one a role may not read.
 *
 * Public: 6 views over `/` (3), `/pricing` (2) and `/docs` (1), three of them keyed, one of the three
 * unkeyed. Private: 3 views of `/admin/billing`, two keyed to one key and one unkeyed. One more view
 * from August, outside the range, so the range discipline is exercised rather than assumed.
 *
 * Per day the public views are 2, 1, 1, 2 and the private ones are 0, 2, 1, 0, which is what makes a
 * withheld policy change the shape of the series and not only the paths.
 */
const EVENTS: AdminAnalyticsEvent[] = [
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", source: "search", at: "2026-09-27T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", visitorKey: "v-2", source: "news", at: "2026-09-27T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", visitorKey: "v-1", at: "2026-09-28T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: PRIVATE, visitorKey: "v-3", at: "2026-09-28T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: PRIVATE, visitorKey: "v-3", at: "2026-09-28T11:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: PRIVATE, at: "2026-09-29T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", visitorKey: "v-2", source: "news", at: "2026-09-29T10:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/docs", visitorKey: "v-4", at: "2026-09-30T08:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/", at: "2026-09-30T09:00:00.000Z" },
  { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/old", visitorKey: "v-5", at: "2026-08-01T09:00:00.000Z" },
];

/** Public views in the range, and private ones. The two the policy splits the file between. */
const PUBLIC_VIEWS = 6;
const PRIVATE_VIEWS = 3;
const IN_RANGE = PUBLIC_VIEWS + PRIVATE_VIEWS;

/** A policy over the seed, which is a rule about one path rather than a boolean over the file. */
const publicOnly = (path: string): boolean => path !== PRIVATE;

/** The policy, counted, so a test can read what the file was built from. */
function countingPublicOnly(): { policy: (path: string) => boolean; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    policy: (path) => {
      asked.push(path);
      return publicOnly(path);
    },
  };
}

async function seeded(events: readonly AdminAnalyticsEvent[] = EVENTS): Promise<AdminPersistenceAdapter> {
  const store = createMemoryPersistenceAdapter();
  for (const event of events) await adminAnalyticsRecord(store, event, { now: CLOCK });
  return store;
}

/** The same store with `queryPage` taken away, which is the shape the analytics layer also answers on. */
async function rowsOnly(events?: readonly AdminAnalyticsEvent[]): Promise<AdminPersistenceAdapter> {
  const inner = await seeded(events);
  return {
    read: inner.read,
    query: inner.query,
    create: inner.create,
    update: inner.update,
    delete: inner.delete,
  };
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** A totals line, so that a case which edits one never hand-counts the empty cells. */
const totalLine = (metric: string, value: string | number): string =>
  ["total", metric, String(value), "", "", "", "", "", "", "", "", ""].join(",");

/** The figures a file's body says, summed the way a spreadsheet would sum the column. */
function bodyOf(figures: {
  series: readonly { views: number }[];
  paths: readonly { views: number }[];
  sources: readonly { views: number }[];
  visitors: readonly { views: number }[];
}) {
  return {
    series: sum(figures.series.map((row) => row.views)),
    paths: sum(figures.paths.map((row) => row.views)),
    sources: sum(figures.sources.map((row) => row.views)),
    visitors: sum(figures.visitors.map((row) => row.views)),
  };
}

/**
 * The reconciliations a report's file has to satisfy, checked against the file rather than the writer.
 *
 * Read back out of the text through the shipped reader, so a reader is on the other side of every
 * assertion and the `totals` compared here are the ones the *file* states. Each identity is an
 * equation between two things in the file, which is why none of them is a number typed in here.
 *
 * Which identities apply is read out of the file's own manifest rather than out of the caller's
 * options, because a section that is not in the file has no rows to reconcile and a check that
 * pretended otherwise would be a check of nothing.
 */
function expectReportToAddUp(figures: AdminAnalyticsReportFigures): void {
  const totals = figures.totals;
  const held = (figures.manifest.sections ?? "").split(" ").filter((section) => section.length > 0);
  const present: ReadonlySet<string> = new Set(held);

  // A file with no body has nothing to check its totals against, so a helper that found one would be
  // reporting a pass it did not earn.
  expect(held.length).toBeGreaterThan(0);
  for (const section of held) expect(ADMIN_ANALYTICS_REPORT_SECTIONS).toContain(section);

  // The header block's own arithmetic: what was read, what went in, what was held back, and the days the
  // series promised to hold a point for.
  expect(Number(figures.manifest.rows_in_report) + Number(figures.manifest.rows_withheld)).toBe(
    Number(figures.manifest.rows_read),
  );
  expect(Number(figures.manifest.range_days)).toBe(totals.seriesRows);

  // Each table the file holds accounts for the same views as the total, and the rows it could not group
  // are stated beside it rather than dropped, which is the only way both can be true at once.
  if (present.has("series")) {
    expect(figures.series.length).toBe(totals.seriesRows);
    expect(sum(figures.series.map((row) => row.views))).toBe(totals.views);
    expect(sum(figures.series.map((row) => row.unattributed))).toBe(totals.unattributed);
    expect(sum(figures.series.map((row) => row.visitors))).toBeGreaterThanOrEqual(totals.visitors);
  }
  if (present.has("paths")) {
    expect(figures.paths.length).toBe(totals.paths);
    expect(sum(figures.paths.map((row) => row.views)) + totals.pathsUnkeyed).toBe(totals.views);
  }
  if (present.has("sources")) {
    expect(figures.sources.length).toBe(totals.sources);
    expect(sum(figures.sources.map((row) => row.views)) + totals.sourcesUnattributed).toBe(totals.views);
  }
  if (present.has("visitors")) {
    expect(figures.visitors.length).toBe(totals.visitorsRows);
    expect(sum(figures.visitors.map((row) => row.views)) + totals.visitorsUngrouped).toBe(totals.views);
    // One row per distinct key, so the count of the rows is the distinct count the series states. A key
    // that reached the table as a blank string is the one case where these differ by one, and the file
    // says so in `visitors_ungrouped` beside `unattributed` rather than hiding it.
    expect(new Set(figures.visitors.map((row) => row.visitorKey)).size).toBe(totals.visitors);
    expect(totals.visitorsUngrouped).toBe(totals.unattributed);
  }
}

describe("the file a report writes", () => {
  it("states a period, a policy and its own totals before a single figure of the body", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
    });
    const lines = report.csv.replace(/\r\n/g, "\n").split("\n");

    // The header first, then what the file is, then what it says, then the figures. A reader who opens
    // the file sees the period and the policy before any of the numbers, which is the order a report
    // has to be read in.
    expect(lines[0]).toBe(
      "section,metric,value,day,label,views,visitors,unattributed,path,source,visitor_key,last_seen_at",
    );
    expect(lines[1]).toBe("manifest,range_from,2026-09-27,,,,,,,,,");
    expect(lines[2]).toBe("manifest,range_to,2026-09-30,,,,,,,,,");
    expect(lines[3]).toBe("manifest,range_days,4,,,,,,,,,");
    expect(lines[4]).toBe("manifest,path_policy,host,,,,,,,,,");
    expect(lines[5]).toBe("manifest,sections,series paths sources,,,,,,,,,");
    expect(lines[6]).toBe("manifest,rounding,none,,,,,,,,,");
    expect(lines[7]).toBe("manifest,rows_read,9,,,,,,,,,");
    expect(lines[8]).toBe("manifest,rows_in_report,6,,,,,,,,,");
    expect(lines[9]).toBe("manifest,rows_withheld,3,,,,,,,,,");
    expect(lines[10]).toBe("total,views,6,,,,,,,,,");
    expect(lines[11]).toBe("total,visitors,3,,,,,,,,,");
    // Nine totals, then the first figure of the body, which is a day of the range and a day nothing
    // landed on: a report that omitted it would draw a straight line across the gap and call it a
    // trend.
    expect(lines[14]).toBe("total,series_rows,4,,,,,,,,,");
    expect(lines[21]).toBe("series,,,2026-09-27,2026-09-27,2,2,0,,,,");
    expect(lines[24]).toBe("series,,,2026-09-30,2026-09-30,2,1,1,,,,");
    // The ranking, with the moment each path was last looked at beside it.
    expect(lines[25]).toBe("paths,,,,,3,,,/,,,2026-09-30T09:00:00.000Z");
    expect(lines[27]).toBe("paths,,,,,1,,,/docs,,,2026-09-30T08:00:00.000Z");
    // And the sources, in the same column order, so one header serves four tables.
    expect(lines[28]).toBe("sources,,,,news,2,,,,news,,");
    expect(lines[lines.length - 2]).toBe("sources,,,,search,1,,,,search,,");
    // Nothing was written past the last figure, and the file ends with the break that says so.
    expect(lines[lines.length - 1]).toBe("");
  });

  it("adds up: the totals are the sum of the rows the file wrote beside them", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS],
    });

    // Read out of the text, so the totals compared are the file's own claims.
    const read = await adminAnalyticsReportFigures(report.csv);
    expectReportToAddUp(read);
    // And the object the call returned says the same thing as the file it wrote, or a host showing a
    // summary beside a download would contradict the download.
    expect(bodyOf(report.figures)).toEqual(bodyOf(read));
    expect(report.figures.totals).toEqual(read.totals);
    expect(report.manifest).toEqual(read.manifest);
  });

  it("adds up with no policy at all, where nothing is in the report and nothing happened either", async () => {
    // A report of a range in which no path is permitted is a real file of zeroes, and a file of zeroes
    // is the one thing a reader cannot check. It still has to reconcile, or "nothing was permitted"
    // and "the arithmetic is wrong" look the same in a spreadsheet.
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE });

    expectReportToAddUp(await adminAnalyticsReportFigures(report.csv));
    // Nine views were read and none of them is in the file, which is the claim that separates this from
    // a quiet week.
    expect(report.manifest.rows_read).toBe(String(IN_RANGE));
    expect(report.manifest.rows_in_report).toBe("0");
    expect(report.manifest.rows_withheld).toBe(String(IN_RANGE));
  });

  it("writes a figure as the whole number it is, and says that it rounds nothing", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS],
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    // The rule is in the file rather than in a document, because the file is what travels.
    expect(report.manifest.rounding).toBe("none");

    // Every numeric cell is a whole number, read as one, so a spreadsheet can sum the column and hold
    // it against the total. A file that wrote `6.0` for a count of views would be a file a reader has
    // to reconcile by hand.
    const numbers = report.csv
      .replace(/\r\n/g, "\n")
      .split("\n")
      .flatMap((line) => line.split(","))
      .filter((cell) => /^\d+$/.test(cell));
    expect(numbers.length).toBeGreaterThan(0);
    for (const cell of numbers) expect(Number.isSafeInteger(Number(cell)), cell).toBe(true);
    // And the two totals that are not sums of a column are still whole: distinct visitors is a count of
    // keys rather than a sum of days.
    for (const figure of Object.values(read.totals)) expect(Number.isSafeInteger(figure)).toBe(true);
  });
});

describe("what the permission policy decides", () => {
  it("keeps a path it refuses out of the file entirely, not out of one column", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS],
    });

    // By content rather than by a count, because a count of the path rows would still pass for a file
    // that held the path somewhere else in it.
    expect(report.csv).not.toContain(PRIVATE);
    // Nothing derived from it either: the path's views are not in the daily series, not in the total
    // and not in the sources, because the refusal is applied to the rows rather than to the printout.
    const read = await adminAnalyticsReportFigures(report.csv);
    expect(read.totals.views).toBe(PUBLIC_VIEWS);
    expect(sum(read.series.map((point) => point.views))).toBe(PUBLIC_VIEWS);
    expect(sum(read.paths.map((path) => path.views))).toBe(PUBLIC_VIEWS);
    expect(read.totals.views).toBeLessThan(IN_RANGE);
    // The views are gone from the count as well as from the ranking, which is what the manifest is for:
    // a reader who sees six knows there were nine somewhere.
    expect(report.manifest.rows_withheld).toBe(String(PRIVATE_VIEWS));
  });

  it("withholds every path when the host supplied no policy, and names that in the file", async () => {
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE });

    // "No check" is not "allowed". A host that has not said which paths a session may see has not said
    // it may see all of them, and a file that assumed so would be the one leak this whole layer exists
    // to refuse.
    expect(report.manifest.path_policy).toBe("none");
    expect(report.manifest.rows_in_report).toBe("0");
    expect(report.manifest.rows_withheld).toBe(String(IN_RANGE));
    expect(report.csv).not.toContain("/pricing");
    // The safe default is a name in the output rather than a silence in it, so a host reading the file
    // back can tell which of the two happened without asking.
    expect(report.csv).toContain("manifest,path_policy,none");
  });

  it("says a refusal apart from a quiet range, which are the same zeros from the outside", async () => {
    // Two files with nothing in them: one over a store that saw no traffic, one over a store whose
    // traffic was all withheld. A reader cannot tell them apart from the figures, so the manifest has
    // to, and this asserts the difference is in the text.
    const refused = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: () => false,
    });
    const quiet = await adminAnalyticsReport({ store: await seeded([]), range: RANGE });

    // Same figures, because both are zero, which is exactly why the manifest row exists.
    expect(quiet.figures.totals.views).toBe(refused.figures.totals.views);
    expect(quiet.figures.paths).toEqual(refused.figures.paths);
    expect(quiet.csv).not.toBe(refused.csv);
    expect(refused.manifest.rows_withheld).toBe(String(IN_RANGE));
    expect(quiet.manifest.rows_withheld).toBe("0");
    expect(refused.csv).toContain(`manifest,rows_withheld,${IN_RANGE}`);
    expect(quiet.csv).toContain("manifest,rows_withheld,0");
    // Both are still files that add up, so a reader checking the arithmetic is not told about either.
    expectReportToAddUp(await adminAnalyticsReportFigures(refused.csv));
    expectReportToAddUp(await adminAnalyticsReportFigures(quiet.csv));
  });

  it("asks the policy once per distinct path, and never about a path outside the range", async () => {
    const { policy, asked } = countingPublicOnly();
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: policy,
    });

    // Ten events, four distinct paths inside the range and one from August the range cannot place. A
    // rule that had to ask a store about each of those would be a report that costs a round trip per
    // view rather than per page.
    expect([...asked].sort()).toEqual(["/", "/admin/billing", "/docs", "/pricing"]);
    expect(asked).toHaveLength(new Set(asked).size);
    // The path the range excludes is not among them, because the read never handed it over.
    expect(asked).not.toContain("/old");
    expect(report.manifest.rows_in_report).toBe(String(PUBLIC_VIEWS));
  });

  it("refuses a policy that answers something which is not a decision", async () => {
    // A predicate whose author forgot the `return` is the same class of mistake as no predicate at
    // all, and reading it as "withhold" would quietly filter a report forever with nothing in the file
    // to say so.
    const broken = (): boolean => undefined as unknown as boolean;
    await expect(
      adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: broken }),
    ).rejects.toThrow(/neither true nor false/);
  });

  it("lets a policy's own failure through rather than reporting it as a refusal", async () => {
    // A check that throws is a check that is broken, and a report holding half a range with a manifest
    // saying six rows were withheld would be a wrong answer to a question the host can still hear.
    const failing = (path: string): boolean => {
      if (path === PRIVATE) throw new Error("the rule's own store is unreachable");
      return true;
    };
    await expect(
      adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: failing }),
    ).rejects.toThrow("the rule's own store is unreachable");
  });

  it("agrees with the chart beside it, because both are the package's own figures", async () => {
    // A policy that permits everything: the report is then the range, and every figure in it has to be
    // the figure `adminAnalyticsSeries` and its siblings return for the same range. A report that
    // re-derived a figure would be free to disagree with the tile above it, and nothing would show it.
    const store = await seeded();
    const report = await adminAnalyticsReport({
      store,
      range: RANGE,
      pathPolicy: () => true,
    });

    expect(report.figures.series).toEqual((await adminAnalyticsSeries(store, { range: RANGE })).points);
    expect(report.figures.paths).toEqual((await adminAnalyticsTopPaths(store, { range: RANGE, limit: 10 })).paths);
    expect(report.figures.sources).toEqual(
      (await adminAnalyticsSources(store, { range: RANGE, limit: 10 })).sources,
    );
    // The totals are the series' own, so a tile and a download cannot report different months.
    const series = await adminAnalyticsSeries(store, { range: RANGE });
    expect(report.figures.totals.views).toBe(series.totals.views);
    expect(report.figures.totals.visitors).toBe(series.totals.visitors);
  });
});

describe("the visitor key in the file", () => {
  it("is absent from a report that did not ask for it, and absent from its own header", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
    });

    // By content, because a key appearing in one column of one row is the whole risk. The keys are the
    // host's own values and a host that has decided one is pseudonymous may still not want a file that
    // leaves the machine holding six of them.
    expect(report.csv).not.toContain("v-1");
    expect(report.csv).not.toContain("v-2");
    // The column is in the header whether or not the section is, because a CSV has one header for every
    // table and a reader has to be able to trust it. What is absent is the value: no row in the file
    // carries a key, and that is the claim under test rather than the column's name.
    expect(report.manifest.sections).toBe(ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS.join(" "));
    expect(report.manifest.sections).not.toContain("visitors");
    expect(report.figures.visitors).toEqual([]);
  });

  it("is in the file once the host names the section, which is the explicit request", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: [...ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS, "visitors"],
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    // The manifest names it too, so a file holding keys says it is holding keys.
    expect(report.manifest.sections).toContain("visitors");
    expect(report.manifest.sections).toBe("series paths sources visitors");
    expect(read.visitors.map((row) => row.visitorKey)).toEqual(["v-1", "v-2", "v-4"]);
    expect(read.totals.visitorsRows).toBe(read.visitors.length);
    // The unkeyed view is still a view and still no visitor, and the file says which it was rather
    // than quietly dropping it: `v-1` and `v-2` share two views each, `v-4` has one, and the sixth
    // public view carried no key at all.
    expect(sum(read.visitors.map((row) => row.views))).toBe(read.totals.views - read.totals.visitorsUngrouped);
    expectReportToAddUp(read);
  });

  it("states the figure for a section it left out, so the totals are the same range twice over", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: ["series"],
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    expect(read.visitors).toEqual([]);
    expect(read.manifest.sections).toBe("series");
    // Stated rather than absent, and stated about the range rather than about the file: a report of the
    // same range with the section included says the same number, so two downloads of one range cannot
    // disagree about how many keys it held.
    expect(read.totals.visitorsRows).toBe(3);
    expect(read.totals.paths).toBe(3);
    expect(read.totals.visitorsRows).toBe(report.figures.totals.visitorsRows);
    expectReportToAddUp(read);
  });
});

describe("the read's own refusal", () => {
  it("produces no file at all rather than a file of the range that fitted", async () => {
    // A range one event above the read's cap. A report of the thousand events the read would serve
    // would be a file claiming to be the month, which is the failure `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ`
    // exists for, and the report must not be the thing that reintroduces it.
    const over: AdminAnalyticsEvent[] = Array.from(
      { length: ADMIN_ANALYTICS_MAX_EVENTS_PER_READ + 1 },
      (_, index) => ({
        kind: ADMIN_ANALYTICS_PAGE_VIEW,
        path: "/",
        visitorKey: `v-${index}`,
        at: "2026-09-30T09:00:00.000Z",
      }),
    );
    const store = await seeded(over);

    const refusal = adminAnalyticsReport({ store, range: RANGE, pathPolicy: () => true });
    await expect(refusal).rejects.toBeInstanceOf(AdminAnalyticsError);
    await expect(refusal).rejects.toThrow(/ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/);
    // The same refusal the chart beside it gets, from the same read, for the same reason.
    await expect(adminAnalyticsSeries(store, { range: RANGE })).rejects.toThrow(
      /ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/,
    );
    await expect(adminAnalyticsTopPaths(store, { range: RANGE, limit: 5 })).rejects.toThrow(
      /ADMIN_ANALYTICS_MAX_EVENTS_PER_READ/,
    );
    // And the refusal is taken from the store's own count rather than from the rows that came back.
    await expect(refusal).rejects.toThrow(
      new RegExp(`that range holds ${ADMIN_ANALYTICS_MAX_EVENTS_PER_READ + 1} events`),
    );
  });

  it("refuses a body of rows larger than one report writes, naming the range rather than the table", async () => {
    // The only thing a host can make a report large with is its own range, because the read is already
    // bounded. So the cap's message has to point at the range rather than at a table that is fine.
    // Fifty thousand and one distinct day keys, which the day-key check accepts because a key is a key
    // and the aggregation files one bucket per key of the range whatever is on it.
    const long = Array.from({ length: ADMIN_ANALYTICS_REPORT_MAX_ROWS + 1 }, (_, index) => {
      const year = 1000 + Math.floor(index / 336);
      const month = String((Math.floor(index / 28) % 12) + 1).padStart(2, "0");
      return `${year}-${month}-${String((index % 28) + 1).padStart(2, "0")}`;
    });
    expect(new Set(long).size).toBe(ADMIN_ANALYTICS_REPORT_MAX_ROWS + 1);

    const refusal = adminAnalyticsReport({ store: await seeded(), range: long, pathPolicy: publicOnly });
    await expect(refusal).rejects.toThrow(/above the 50000 one report writes/);
    // The range is what grew, and the message has to say so rather than blaming the traffic: a host that
    // reads "narrow the query" for a file of zero views is being sent to shorten a month it did not ask
    // for.
    await expect(refusal).rejects.toThrow(/grew here is the range rather than the traffic/);
    await expect(refusal).rejects.toThrow(
      new RegExp(`${ADMIN_ANALYTICS_REPORT_MAX_ROWS + 1} of them are series`),
    );
  });
});

describe("a file read back", () => {
  it("reproduces the figures the writer held, through the shipped reader", async () => {
    const report = await adminAnalyticsReport({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
      sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS],
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    expect(read.series).toEqual(report.figures.series);
    expect(read.paths).toEqual(report.figures.paths);
    expect(read.sources).toEqual(report.figures.sources);
    expect(read.visitors).toEqual(report.figures.visitors);
    expect(read.totals).toEqual(report.figures.totals);
    expect(read.manifest).toEqual(report.manifest);
  });

  it("brings back a cell a spreadsheet would have run as text, rather than as the formula", async () => {
    // The path comes off a URL and the source off a referrer, so both are as long as somebody types
    // and either can begin with something a spreadsheet executes. A report that round-tripped such a
    // value would turn a download into something that runs on the reader's machine.
    const hostile: AdminAnalyticsEvent[] = [
      { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "=cmd|'/c calc'!A1", visitorKey: "'=1+1", source: "@SUM(1+1)", at: "2026-09-30T09:00:00.000Z" },
    ];
    const report = await adminAnalyticsReport({
      store: await seeded(hostile),
      range: RANGE,
      pathPolicy: () => true,
      sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS],
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    // Marked on the way out, as the resource export's cells are, so the file is safe to open, and
    // unmarked on the way back in, so the value survives the file.
    expect(report.csv).toContain("'=cmd|'/c calc'!A1");
    expect(read.paths[0]?.path).toBe("=cmd|'/c calc'!A1");
    expect(read.sources[0]?.source).toBe("@SUM(1+1)");
    // A key that is itself a formula survives as text, which is the case a reader that only looked for
    // the formula mark would get wrong.
    expect(read.visitors[0]?.visitorKey).toBe("'=1+1");
    expectReportToAddUp(read);
  });

  it("refuses a file that is not a report, and says which part of it is not", async () => {
    const foreign = "id,name\r\np1,Amber lamp\r\n";
    await expect(adminAnalyticsReportFigures(foreign)).rejects.toThrow(/missing/);

    // A report with a column taken out is refused rather than read with a default, because a figure
    // with nowhere to live is a figure the file cannot be said to state.
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: () => true });
    const columnsDropped = report.csv.replace("visitor_key,", "");
    await expect(adminAnalyticsReportFigures(columnsDropped)).rejects.toThrow(/visitor_key/);
  });

  it("refuses a file whose totals do not hold what it claims to state", async () => {
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: publicOnly });
    const lines = report.csv.split("\r\n");
    const views = totalLine("views", 6);
    expect(lines).toContain(views);

    // A total stated twice is two answers to one question.
    const twice = [...lines];
    twice.splice(lines.indexOf(views) + 1, 0, totalLine("views", 7));
    await expect(adminAnalyticsReportFigures(twice.join("\r\n"))).rejects.toThrow(/states "views" again/);

    const missing = lines.filter((line) => line !== totalLine("visitors", 3)).join("\r\n");
    await expect(adminAnalyticsReportFigures(missing)).rejects.toThrow(/no total of visitors/);

    const notANumber = lines.map((line) => (line === views ? totalLine("views", "six") : line));
    await expect(adminAnalyticsReportFigures(notANumber.join("\r\n"))).rejects.toThrow(/not a whole number/);

    const blank = lines.map((line) => (line === views ? totalLine("views", "") : line));
    await expect(adminAnalyticsReportFigures(blank.join("\r\n"))).rejects.toThrow(/is empty/);
  });

  it("returns a wrong figure faithfully, which is why the body is checked against it and not by it", async () => {
    // A total edited from six to nine is a file that is structurally perfect and says something false,
    // and no reader can tell: nine is a whole number a person could have typed. This is the reason the
    // reader hands the totals back separately from the rows instead of computing one from the other,
    // and the reason the reconciliation is a test rather than a rule inside the reader.
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: publicOnly });
    const tampered = report.csv.replace(totalLine("views", 6), totalLine("views", 9));
    const read = await adminAnalyticsReportFigures(tampered);

    expect(read.totals.views).toBe(9);
    // The body still says six, which is the disagreement, and it is visible to whoever checks.
    expect(bodyOf(read).series).not.toBe(read.totals.views);
    expect(() => expectReportToAddUp(read)).toThrow();
  });

  it("refuses a manifest that does not say what the file covers", async () => {
    const report = await adminAnalyticsReport({ store: await seeded(), range: RANGE, pathPolicy: publicOnly });
    const lines = report.csv.split("\r\n");

    // `rows_withheld` is what keeps a refusal from reading as an empty site, so a file without it is a
    // file that cannot be checked and is refused as such.
    const withoutRange = lines.filter((line) => !line.startsWith("manifest,range_from")).join("\r\n");
    await expect(adminAnalyticsReportFigures(withoutRange)).rejects.toThrow(/no range_from/);
    const withoutWithheld = lines.filter((line) => !line.startsWith("manifest,rows_withheld")).join("\r\n");
    await expect(adminAnalyticsReportFigures(withoutWithheld)).rejects.toThrow(/no rows_withheld/);
  });
});

describe("both shipped stores", () => {
  it("produce the same file from the same events, byte for byte", async () => {
    const memory = await seeded();
    const sqlite = createSqlitePersistenceAdapter({ url: "file::memory:" });
    for (const event of EVENTS) await adminAnalyticsRecord(sqlite, event, { now: CLOCK });

    const options = { range: RANGE, pathPolicy: publicOnly, sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS] } as const;
    const fromMemory = await adminAnalyticsReport({ store: memory, ...options });
    const fromSqlite = await adminAnalyticsReport({ store: sqlite, ...options });

    // The rows themselves are not the same rows: one store numbers its records and the other names them
    // with a uuid, so the two tables hold the same ten views under different identities. That is what
    // makes the file comparison mean something. A report holding a row's id would differ between the
    // two stores, and so would anything else it took from the store rather than from the figures.
    const ids = async (store: AdminPersistenceAdapter): Promise<string[]> =>
      (await adminAnalyticsRead(store, { range: RANGE })).map((row) => row.id);
    expect(await ids(sqlite)).not.toEqual(await ids(memory));

    expect(fromSqlite.csv).toBe(fromMemory.csv);
    expectReportToAddUp(await adminAnalyticsReportFigures(fromSqlite.csv));
  });

  it("produce the same file as a store that cannot page at all", async () => {
    // The analytics layer answers identically on a store with no `queryPage`, and a report that read
    // through only the paged shape would be the one caller of that read that disagreed.
    const paged = await seeded();
    const plain = await rowsOnly();
    expect("queryPage" in plain).toBe(false);

    const options = { range: RANGE, pathPolicy: publicOnly, sections: [...ADMIN_ANALYTICS_REPORT_SECTIONS] } as const;
    expect((await adminAnalyticsReport({ store: plain, ...options })).csv).toBe(
      (await adminAnalyticsReport({ store: paged, ...options })).csv,
    );
  });
});

describe("the response a route hands back", () => {
  it("carries the file, the type and the name the range gives itself", async () => {
    const response = await adminAnalyticsReportResponse({
      store: await seeded(),
      range: RANGE,
      pathPolicy: publicOnly,
    });

    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="analytics-2026-09-27-to-2026-09-30.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    const read = await adminAnalyticsReportFigures(await response.text());
    expectReportToAddUp(read);
  });

  it("reduces a name a host chose by the same rules the resource export does", async () => {
    // A filename is a string the caller chose, and a newline in one is a second header written by
    // whoever downloads the file. The two exports are separate modules and each has to be right about
    // it, so this asserts they are rather than trusting that they are.
    const hostile = 'a"\r\nx-injected: 1\r\n.csv';
    const store = await seeded();
    const mine = await adminAnalyticsReportResponse({
      store,
      range: RANGE,
      pathPolicy: publicOnly,
      filename: hostile,
    });
    const theirs = await adminResourceExportResponse({
      actions: { queryPage: async () => ({ rows: [], total: 0 }) },
      resource: "products",
      columns: [{ key: "id" }],
      filename: hostile,
    });

    expect(mine.headers.get("content-disposition")).toBe(theirs.headers.get("content-disposition"));
    expect(mine.headers.get("content-disposition")).toBe('attachment; filename="a-x-injected-1-.csv"');
    expect([...mine.headers.keys()].filter((name) => name === "x-injected")).toEqual([]);
  });
});

describe("what a report refuses to be written", () => {
  it("types each figure as a number and each table as present, so a partial answer cannot be held", () => {
    // The rule the round-two read fix established, applied to a file. A figure whose type admits
    // `undefined` is a figure a caller can render as a blank beside the others, and a table whose type
    // admits absence is a table a caller can check without finding. `undefined extends T` is how a field
    // that admits "no value" is caught, and the tuple stops compiling the moment one does.
    type Whole<T> = undefined extends T ? false : true;
    type Figures = AdminAnalyticsReportFigures;
    type Totals = AdminAnalyticsReportTotals;
    const shape: {
      views: Totals["views"];
      distinctKeys: Totals["visitors"];
      series: Figures["series"];
      paths: Figures["paths"];
      sources: Figures["sources"];
      visitors: Figures["visitors"];
    } = { views: 0, distinctKeys: 0, series: [], paths: [], sources: [], visitors: [] };
    const whole: [
      Whole<typeof shape.views>,
      Whole<typeof shape.distinctKeys>,
      Whole<typeof shape.series>,
      Whole<typeof shape.paths>,
      Whole<typeof shape.sources>,
      Whole<typeof shape.visitors>,
    ] = [true, true, true, true, true, true];

    expect(whole).toEqual([true, true, true, true, true, true]);
    expect(Object.keys(shape).sort()).toEqual([
      "distinctKeys",
      "paths",
      "series",
      "sources",
      "views",
      "visitors",
    ]);
  });

  it("gives every field of a row a column, so a figure cannot be written that no column carries", () => {
    // A field added to the row and not to the columns would be carried by nothing and read from
    // nothing, and the file would be missing a figure while every figure in it still added up. The
    // check is a type because that is the only place the shape admits it, and the runtime assertion
    // below is there so the file reports a failure rather than only failing to build.
    type Missing = Exclude<
      keyof AdminAnalyticsReportRow,
      (typeof ADMIN_ANALYTICS_REPORT_COLUMNS)[number]
    >;
    type EveryFieldHasAColumn = [Missing] extends [never] ? true : false;
    const everyFieldHasAColumn: EveryFieldHasAColumn = true;
    expect(everyFieldHasAColumn).toBe(true);

    // And the columns are the ones the file's header spells, in order, which is the contract a reader
    // outside this package is held to.
    expect(ADMIN_ANALYTICS_REPORT_COLUMNS.map(analyticsReportHeader)).toEqual([
      "section",
      "metric",
      "value",
      "day",
      "label",
      "views",
      "visitors",
      "unattributed",
      "path",
      "source",
      "visitor_key",
      "last_seen_at",
    ]);
  });

  it("is refused a range, because a figure with no period beside it is a number about nothing", async () => {
    const store = await seeded();
    await expect(
      adminAnalyticsReport({ store, range: [] as readonly string[] }),
    ).rejects.toThrow(/none was given/);
    // And the store is never asked, so a refused report has not read a row to refuse it.
    await expect(adminAnalyticsReport({ store, range: undefined as unknown as readonly string[] })).rejects.toThrow(
      AdminAnalyticsError,
    );
  });

  it("is refused a range that is not a run of day keys, by the reader that refuses a read", async () => {
    const store = await seeded();
    await expect(
      adminAnalyticsReport({ store, range: ["2026-09-27", "the 28th"] }),
    ).rejects.toThrow(/run of day keys/);
  });

  it("is refused a section list that could not add up to the totals it states", async () => {
    const store = await seeded();
    const report = { store, range: RANGE, pathPolicy: publicOnly };

    await expect(adminAnalyticsReport({ ...report, sections: [] })).rejects.toThrow(/no section/);
    await expect(
      adminAnalyticsReport({ ...report, sections: ["paths", "nope" as "series"] }),
    ).rejects.toThrow(/not a section/);
    // Written twice is a file whose rows are not the count it states, which is the one thing a report
    // may not be.
    await expect(
      adminAnalyticsReport({ ...report, sections: ["series", "series"] }),
    ).rejects.toThrow(/named twice/);
  });

  it("names a kind it was given, so a report of one thing does not read as a report of all of it", async () => {
    const store = await seeded();
    const report = await adminAnalyticsReport({
      store,
      range: RANGE,
      pathPolicy: publicOnly,
      kind: ADMIN_ANALYTICS_PAGE_VIEW,
    });

    expect(report.manifest.kind).toBe(ADMIN_ANALYTICS_PAGE_VIEW);
    expect(report.csv).toContain("manifest,kind,page_view");
    expectReportToAddUp(await adminAnalyticsReportFigures(report.csv));
  });

  it("uses the host's own names for a day and a source, which are the host's vocabulary", async () => {
    const store = await seeded();
    const report = await adminAnalyticsReport({
      store,
      range: RANGE,
      pathPolicy: publicOnly,
      label: (day) => `day ${day.slice(-2)}`,
      sourceLabel: (source) => source.toUpperCase(),
    });
    const read = await adminAnalyticsReportFigures(report.csv);

    expect(read.series[0]?.label).toBe("day 27");
    // The recorded value is still there beside the name, because a label the host chose does not replace
    // the value it names and a report that dropped it would be a report nobody could group.
    expect(read.sources.map((source) => [source.label, source.source])).toEqual([
      ["NEWS", "news"],
      ["SEARCH", "search"],
    ]);
    expectReportToAddUp(read);
  });
});
