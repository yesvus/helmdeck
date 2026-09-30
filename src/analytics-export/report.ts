// SPDX-License-Identifier: MIT

/**
 * A report over the figures a chart draws, as a file a person opens in a spreadsheet.
 *
 * This is not the resource export with different columns. That one streams rows of a table under a
 * row-scoped rule, bounded by a cap because a hundred thousand rows is a file nobody can open. This
 * one reads a range the host named, refuses above `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ` before it
 * starts, and writes figures rather than rows, which changes what a permission check has to mean.
 *
 * **A permission check for a figure is a decision about a path, and it is taken before the figure
 * exists.** A row-scoped rule answers "may this session read these products", and a report of
 * analytics has no row to ask about: it has a path, and the path names a page whose existence a role
 * may not be told about. Nine views of `/admin/billing` in a download is the same shape of leak as a
 * reference to a row a role may not read, so the path is what the host's policy is asked about, and it
 * is asked about the path rather than about the file. A whole-report check cannot do this job: it
 * either gives over everything, including a path the role may not read, or refuses everything, and a
 * session that may read the public pages and not the private ones has no answer to give it.
 *
 * The refusal is applied to the rows rather than to the printed lines, and that is the whole
 * discipline. A path the policy withholds contributes to no figure in the file, so the daily series,
 * the paths, the sources and the totals are all counting the same rows and none of them disagrees with
 * another. The alternative, keeping the totals whole and dropping the path from the ranking, produces
 * a file whose headline number includes traffic a reader may not account for, and whose ranking does
 * not add up to it.
 *
 * **A host that supplies no policy gets every path withheld, and the file says so.** The alternative
 * would be to treat a missing policy as permission, which is the one answer that makes an unwired host
 * a leaking one and nothing in the file would show. Withheld is the safe reading, it is legible in
 * `path_policy` and in `rows_withheld`, and a host that meant to allow everything has one line to add.
 *
 * **The paths are the most useful figure in the file and the one that leaks, so the file does not
 * carry one until a host has said which paths are permitted.** The section is in the default set, so a
 * host that expects it finds it, and it is empty rather than absent, because a missing section and an
 * empty one are different claims and only one of them is a policy saying no.
 *
 * The file is a report and not a list. A period of views is one row per day rather than one row per
 * view, every figure is a whole number written as one, and the totals are stated in the file beside
 * the rows they are the total of, so a spreadsheet can check them without being told the rule.
 */

import { adminAggregate } from "../aggregate/aggregate.js";
import { adminCsvCell } from "../export/csv.js";
import { AdminAnalyticsError, type AdminAnalyticsEventRow } from "../analytics/events.js";
import {
  adminAnalyticsRead,
  adminAnalyticsSeries,
  adminAnalyticsSources,
  adminAnalyticsTopPaths,
  type AdminAnalyticsReadOptions,
} from "../analytics/query.js";
import type { AdminPersistenceAdapter } from "../adapters/host.js";
import {
  ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS,
  ADMIN_ANALYTICS_REPORT_MANIFEST,
  ADMIN_ANALYTICS_REPORT_MAX_ROWS,
  ADMIN_ANALYTICS_REPORT_SECTIONS,
  ADMIN_ANALYTICS_REPORT_TOTALS,
  analyticsReportCells,
  analyticsReportHeaderCells,
  analyticsReportTotalField,
  type AdminAnalyticsReportFigures,
  type AdminAnalyticsReportRow,
  type AdminAnalyticsReportSection,
  type AdminAnalyticsReportTotals,
  type AdminAnalyticsReportVisitor,
} from "./format.js";

export { ADMIN_ANALYTICS_REPORT_MAX_ROWS } from "./format.js";

const END = "\r\n";

/**
 * Whether a path may appear in this report at all, asked once per distinct path in the range.
 *
 * A path and nothing else, because a path is the only thing in this file that can name something a
 * role may not read. Allowed to answer with a promise, as the package's own permission rule is, so a
 * host whose decision needs a store is not asked to load one into memory to answer it.
 *
 * The answer has to be `true` or `false`. Anything else is a broken check rather than a decision, and
 * a broken check that quietly became a filter is how a host ends up reporting half its traffic for a
 * week with nothing in the file to say so.
 */
export type AdminAnalyticsPathPolicy = (path: string) => boolean | Promise<boolean>;

export type AdminAnalyticsReportOptions = {
  /** The store the range is read from, through the same read a chart is drawn from. */
  store: AdminPersistenceAdapter;
  /**
   * The day keys the report covers, oldest first.
   *
   * Required rather than optional, and it is the one option here that is not a preference. Every
   * figure in the file is a figure over a period, and a report whose period is whatever the table
   * happens to hold is a file claiming to be a period without saying which, which is the claim this
   * format exists to make checkable.
   */
  range: readonly string[];
  /**
   * Which paths may contribute to any figure in the file, and therefore appear in it.
   *
   * Absent means every path is withheld, and the file's manifest says `path_policy: none` beside the
   * count of rows that took. That is the safe reading rather than the convenient one: a host that has
   * not said which paths a session may see has not said that it may see all of them.
   */
  pathPolicy?: AdminAnalyticsPathPolicy;
  /** The tables the file holds. The defaults are the series, the paths and the sources. */
  sections?: readonly AdminAnalyticsReportSection[];
  /** Only events of this kind, for a host reporting one thing rather than everything. */
  kind?: string;
  /**
   * How many events one read may return, up to `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ`.
   *
   * The read's own knob, passed through rather than restated, so a report and the chart beside it are
   * bounded by one number and a host turning one down turns both down.
   */
  maxEvents?: number;
  /** How a day is named in the series. The key when absent, which is a name and not a date. */
  label?: (key: string) => string;
  /** How a recorded source is named in the sources table, which is the host's own vocabulary. */
  sourceLabel?: (source: string) => string;
};

export type AdminAnalyticsReportOptionsWithName = AdminAnalyticsReportOptions & {
  /** The name the browser is offered the file under. The range's own when none is given. */
  filename?: string;
};

export type AdminAnalyticsReport = {
  /** The name the file is offered under, already reduced to characters a header can carry. */
  filename: string;
  manifest: Readonly<Record<string, string>>;
  figures: AdminAnalyticsReportFigures;
  /**
   * The whole file, as one string.
   *
   * Held whole rather than walked in windows, and the reason is the shape of the thing rather than its
   * size: a report's totals are the total of its own rows, so they cannot be known until every row is,
   * and there is nothing to stream past. A row-per-view file of the same range would be fifty times
   * this and would still not be a report, which is what the resource export's own cap says about it.
   */
  csv: string;
};

/**
 * The sections to write, checked, de-duplicated and put in this format's order.
 *
 * Written in the order declared here rather than the order the host named them in, so two hosts naming
 * the same four sections write the same file. A repeat is refused rather than ignored: a section
 * written twice is a file whose row count is not the count it states.
 */
function sectionsOf(named: readonly AdminAnalyticsReportSection[] | undefined): AdminAnalyticsReportSection[] {
  const asked = named ?? ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS;
  if (!Array.isArray(asked) || asked.length === 0) {
    throw new AdminAnalyticsError(
      "a report holding no section is a file of a header and eleven totals, which is a claim with " +
        "nothing in the file to check it against. Name at least one section.",
    );
  }
  const wanted = new Set<AdminAnalyticsReportSection>();
  for (const section of asked) {
    if (!ADMIN_ANALYTICS_REPORT_SECTIONS.includes(section)) {
      throw new AdminAnalyticsError(
        `${JSON.stringify(section)} is not a section a report holds. The sections are ` +
          `${ADMIN_ANALYTICS_REPORT_SECTIONS.join(", ")}.`,
      );
    }
    if (wanted.has(section)) {
      throw new AdminAnalyticsError(
        `${JSON.stringify(section)} is named twice. A section written twice is a file whose rows are ` +
          "not the count it states.",
      );
    }
    wanted.add(section);
  }
  return ADMIN_ANALYTICS_REPORT_SECTIONS.filter((section) => wanted.has(section));
}

/** A range worth reporting on, refused before a row is read. */
function rangeOf(range: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(range) || range.length === 0) {
    throw new AdminAnalyticsError(
      "a report covers a named range of day keys and none was given. Pass one from " +
        "`adminChartDayRange`, which is the range the package's charts are drawn over: a file of " +
        "figures with no period beside them is a number about an unknown span.",
    );
  }
  return range;
}

/**
 * The paths a host's policy permits, one answer per distinct path in the range.
 *
 * Asked of every distinct path rather than of every row, because a store-backed rule would otherwise
 * be asked a thousand times about the same page for one answer it could have given once. Asked in the
 * order the paths first appear, which the read's newest-first order fixes, so a rule that reads
 * anything of its own gets the same calls in the same order on every run.
 */
async function permitted(
  policy: AdminAnalyticsPathPolicy | undefined,
  rows: readonly AdminAnalyticsEventRow[],
): Promise<ReadonlyMap<string, boolean>> {
  const answers = new Map<string, boolean>();
  if (policy === undefined) return answers;
  for (const path of new Set(rows.map((row) => row.path))) {
    const answer = await policy(path);
    if (typeof answer !== "boolean") {
      throw new AdminAnalyticsError(
        `the path policy answered ${JSON.stringify(answer) ?? "nothing"} for ${JSON.stringify(path)}, ` +
          "which is neither true nor false. A check that does not answer is a broken check rather than " +
          "a decision, and this refuses it rather than reading it as one, because a policy that quietly " +
          "became a filter is how a report ends up holding a fraction of a range with nothing in the " +
          "file to say so.",
      );
    }
    answers.set(path, answer);
  }
  return answers;
}

/**
 * A store holding rows and nothing else, which is what the four figure queries are asked of once the
 * policy has had its say.
 *
 * Every figure in the file is a figure these calls return, over these rows. Bucketing them here instead
 * would be a second implementation of the range discipline, the zero for a day nothing landed on and
 * the total summed off the buckets, and a second implementation is a second answer to a question the
 * chart beside this report already answered.
 *
 * The writes refuse rather than answer, because nothing here writes and a store that said otherwise
 * would be a store this report could corrupt.
 */
function holding(rows: readonly AdminAnalyticsEventRow[]): AdminPersistenceAdapter {
  const refuse = async (): Promise<never> => {
    throw new AdminAnalyticsError("a report's store answers a read and nothing else, and no report writes.");
  };
  return {
    read: refuse,
    query: async <T>() => rows as unknown as T[],
    create: refuse,
    update: refuse,
    delete: refuse,
  };
}

/**
 * One row per distinct key among the visible rows, ranked on the count and then on the key.
 *
 * The package ships no query for this, so it is built from `adminAggregate` the way
 * `adminAnalyticsTopPaths` builds its own: the rows come out of the read newest first, which is what
 * makes the `label` hook the most recent event carrying the key without a second map of maximums.
 * Rows whose key is blank are in neither the list nor a count of visitors, which is the aggregation's
 * own rule rather than one added here.
 */
function byVisitorKey(rows: readonly AdminAnalyticsEventRow[]): {
  visitors: AdminAnalyticsReportVisitor[];
  ungrouped: number;
} {
  const keys = adminAggregate({
    rows,
    key: (row) => row.visitor_key,
    label: (_key, row) => row?.occurred_at ?? "",
    measures: { views: () => 1 },
  });
  return {
    visitors: keys.buckets
      .map((bucket) => ({
        visitorKey: bucket.key,
        views: bucket.values.views,
        lastSeenAt: bucket.label === "" ? null : bucket.label,
      }))
      .sort((left, right) => right.views - left.views || left.visitorKey.localeCompare(right.visitorKey)),
    ungrouped: keys.unkeyed,
  };
}

/**
 * The report the host's range holds, and the file that states it.
 *
 * Everything a file could get wrong is settled before a byte is written, so a refused report is a
 * rejection rather than a body that fails once it is being piped. The order is deliberate: the
 * declarations, then the bounded read, then the policy, then the figures, then the rows.
 *
 * The read is the package's own and is not wrapped, so a range above
 * `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ` is refused by the same call and the same error that refuses
 * the chart beside it, and there is no second cap here that could disagree with it. What is added on
 * top is a refusal for a body of rows too large to be the period it claims, which the read cannot see
 * because a range is a choice and its length is not a count of anything.
 */
export async function adminAnalyticsReport(options: AdminAnalyticsReportOptions): Promise<AdminAnalyticsReport> {
  const range = rangeOf(options.range);
  const sections = sectionsOf(options.sections);
  const read: AdminAnalyticsReadOptions = {
    range,
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
  };

  const rows = await adminAnalyticsRead(options.store, read);
  const allowed = await permitted(options.pathPolicy, rows);
  const visible = rows.filter((row) => allowed.get(row.path) === true);

  const inner = holding(visible);
  const series = await adminAnalyticsSeries(inner, { ...read, ...(options.label ? { label: options.label } : {}) });
  // The limit is the cap, and `total` is the count before it, so a paths table the cap could have cut
  // short is caught by the body check below rather than by a second rule that would have to agree with
  // it. A file holding the first figures of a range is a file claiming to be the range.
  const top = await adminAnalyticsTopPaths(inner, { ...read, limit: ADMIN_ANALYTICS_REPORT_MAX_ROWS });
  const from = await adminAnalyticsSources(inner, {
    ...read,
    limit: ADMIN_ANALYTICS_REPORT_MAX_ROWS,
    ...(options.sourceLabel ? { label: options.sourceLabel } : {}),
  });
  const keyed = byVisitorKey(visible);

  const counts: Readonly<Record<AdminAnalyticsReportSection, number>> = {
    series: series.points.length,
    paths: top.paths.length,
    sources: from.sources.length,
    visitors: keyed.visitors.length,
  };
  const written = sections.map((section) => [section, counts[section]] as const);
  const bodyRows = written.reduce((sum, [, count]) => sum + count, 0);
  if (bodyRows > ADMIN_ANALYTICS_REPORT_MAX_ROWS) {
    const [widest, widestRows] = written.reduce((a, b) => (b[1] > a[1] ? b : a));
    throw new AdminAnalyticsError(
      `that report would write ${bodyRows} rows, above the ${ADMIN_ANALYTICS_REPORT_MAX_ROWS} one report ` +
        `writes, and ${widestRows} of them are ${widest}. The read behind it is already bounded at ` +
        "ADMIN_ANALYTICS_MAX_EVENTS_PER_READ, so what grew here is the range rather than the traffic. " +
        "Shorten it, or give the host a store that sums in SQL, because a report holding the first " +
        "figures of a range is a report claiming to be that range and is not.",
    );
  }

  const totals: AdminAnalyticsReportTotals = {
    views: series.totals.views,
    visitors: series.totals.visitors,
    unattributed: series.totals.unattributed,
    unkeyed: series.totals.unkeyed,
    seriesRows: series.points.length,
    paths: top.total,
    pathsUnkeyed: top.unkeyed,
    sources: from.total,
    sourcesUnattributed: from.unattributed,
    visitorsRows: keyed.visitors.length,
    visitorsUngrouped: keyed.ungrouped,
  };

  const manifest: Record<string, string> = {
    range_from: range[0]!,
    range_to: range[range.length - 1]!,
    range_days: String(new Set(range).size),
    path_policy: options.pathPolicy === undefined ? "none" : "host",
    sections: sections.join(" "),
    // Said in the file rather than left to the reader's assumption, because the rule is what makes the
    // totals above addable: every figure here is a count, written as the whole number it is, so a
    // spreadsheet can sum a column and compare it with the total. Nothing in this format is rounded,
    // and a host that wants a share computes it from these numbers where the rounding is visible.
    rounding: "none",
    rows_read: String(rows.length),
    rows_in_report: String(visible.length),
    rows_withheld: String(rows.length - visible.length),
  };
  if (options.kind !== undefined) manifest.kind = options.kind;

  const line = (cells: readonly string[]): string =>
    `${cells.map((cell) => adminCsvCell(cell)).join(",")}${END}`;
  const rowLine = (row: Partial<AdminAnalyticsReportRow>): string => line(analyticsReportCells(row));
  const lines: string[] = [line(analyticsReportHeaderCells())];

  for (const metric of ADMIN_ANALYTICS_REPORT_MANIFEST) {
    if (Object.hasOwn(manifest, metric)) {
      lines.push(rowLine({ section: "manifest", metric, value: manifest[metric]! }));
    }
  }
  for (const metric of ADMIN_ANALYTICS_REPORT_TOTALS) {
    const field = analyticsReportTotalField(metric)!;
    lines.push(rowLine({ section: "total", metric, value: String(totals[field]) }));
  }
  if (sections.includes("series")) {
    for (const point of series.points) {
      lines.push(
        rowLine({
          section: "series",
          day: point.key,
          label: point.label,
          views: String(point.views),
          visitors: String(point.visitors),
          unattributed: String(point.unattributed),
        }),
      );
    }
  }
  if (sections.includes("paths")) {
    for (const path of top.paths) {
      lines.push(
        rowLine({
          section: "paths",
          path: path.path,
          views: String(path.views),
          ...(path.lastViewedAt === null ? {} : { lastSeenAt: path.lastViewedAt }),
        }),
      );
    }
  }
  if (sections.includes("sources")) {
    for (const source of from.sources) {
      lines.push(
        rowLine({
          section: "sources",
          source: source.source,
          label: source.label,
          views: String(source.views),
        }),
      );
    }
  }
  if (sections.includes("visitors")) {
    for (const visitor of keyed.visitors) {
      lines.push(
        rowLine({
          section: "visitors",
          visitorKey: visitor.visitorKey,
          views: String(visitor.views),
          ...(visitor.lastSeenAt === null ? {} : { lastSeenAt: visitor.lastSeenAt }),
        }),
      );
    }
  }

  const figures: AdminAnalyticsReportFigures = {
    manifest,
    totals,
    series: sections.includes("series") ? series.points : [],
    paths: sections.includes("paths") ? top.paths : [],
    sources: sections.includes("sources") ? from.sources : [],
    visitors: sections.includes("visitors") ? keyed.visitors : [],
  };

  return {
    filename: filenameOf(undefined, range),
    manifest,
    figures,
    csv: lines.join(""),
  };
}

/**
 * The name a host named, or the range's own, reduced to characters a header can carry.
 *
 * The same two rules `adminResourceExportResponse` applies, and the same reason: a filename is a
 * string a caller chose, and a quote or a newline in one is a second header written by whoever
 * downloads the file. Written out rather than shared because the two modules do not otherwise know
 * each other, and `analytics-export.test.ts` checks the two agree on a name built to disagree.
 */
function filenameOf(wanted: string | undefined, range: readonly string[]): string {
  const from = range[0]!;
  const to = range[range.length - 1]!;
  const name = wanted ?? `analytics-${from === to ? from : `${from}-to-${to}`}.csv`;
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "") || "analytics.csv";
}

/**
 * The same file as the response a route hands back.
 *
 * The second of the two rather than the only one, because a route handler is what most hosts need and
 * a string is not it. The name is reduced to characters a header can carry, by the same rule and the
 * same reason as `adminResourceExportResponse`: a filename is a string a caller chose, and a quote or
 * a newline in one is a second header written by whoever downloads the file.
 */
export async function adminAnalyticsReportResponse(
  options: AdminAnalyticsReportOptionsWithName,
): Promise<Response> {
  const report = await adminAnalyticsReport(options);
  return new Response(report.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filenameOf(options.filename, options.range)}"`,
      "cache-control": "no-store",
    },
  });
}
