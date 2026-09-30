// SPDX-License-Identifier: MIT

/**
 * The vocabulary of the report file: the columns, the sections, and the figures its header states.
 *
 * The writer and the reader take every name from here, because a format whose two halves each spell a
 * column is a format whose two halves can be changed one at a time, and the change is invisible from
 * the file: the header still reads, a figure lands in the wrong column, and nothing says so.
 */

import type {
  AdminAnalyticsPoint,
  AdminAnalyticsSource,
  AdminAnalyticsTopPath,
} from "../analytics/query.js";

/** The sections a report can hold, in the order the file writes them. */
export const ADMIN_ANALYTICS_REPORT_SECTIONS = ["series", "paths", "sources", "visitors"] as const;

export type AdminAnalyticsReportSection = (typeof ADMIN_ANALYTICS_REPORT_SECTIONS)[number];

/**
 * The sections a report holds unless a host names others.
 *
 * `visitors` is the one left out, and it is left out because it is the only section that can hold a
 * visitor key. A host that has decided a key is pseudonymous may still not want a file that leaves
 * the machine carrying one, so naming the section is the explicit call, and a report that holds it
 * says so in its own manifest.
 */
export const ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS: readonly AdminAnalyticsReportSection[] = [
  "series",
  "paths",
  "sources",
];

/**
 * One row of the file, as text, whatever the figure is.
 *
 * Every cell is a string because that is what a CSV holds, and a reader that knows a column's type
 * before it has read the row is a reader that has to trust the file about which type it is. The
 * figures are numbers once they have been read, and the columns that are not figures are text even
 * when they look like one: a path of `7` is a path and not the number seven.
 */
export type AdminAnalyticsReportRow = {
  /** Which table the row belongs to, or `manifest` and `total` for the two the file leads with. */
  section: string;
  /** The figure a `manifest` or a `total` row states. */
  metric: string;
  /** The figure itself, as the file states it. */
  value: string;
  /** The day, as the range named it. */
  day: string;
  /** How a day or a source is named, which is the host's own text. */
  label: string;
  /** Events in this row's figure. */
  views: string;
  /** Distinct visitor keys in this row's figure. */
  visitors: string;
  /** Views in this row's figure that carried no key. */
  unattributed: string;
  path: string;
  source: string;
  /** The host's visitor key, in the one section that can hold one. */
  visitorKey: string;
  /** The most recent event behind a path or a visitor. */
  lastSeenAt: string;
};

/**
 * The columns, as the fields they carry, in the order the file writes them.
 *
 * The header text is derived from the field rather than written beside it, so a column cannot be
 * renamed on one side of the format and not the other. `everyFieldListed` is what stops a field being
 * added to the row and not to the file, where it would be carried by no column and read from none.
 */
export const ADMIN_ANALYTICS_REPORT_COLUMNS = [
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
  "visitorKey",
  "lastSeenAt",
] as const satisfies readonly (keyof AdminAnalyticsReportRow)[];

/** A field's name as its column spells it, which is the field in snake case. */
export function analyticsReportHeader(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** The header row, as the cells spell it. */
export function analyticsReportHeaderCells(): string[] {
  return ADMIN_ANALYTICS_REPORT_COLUMNS.map((field) => analyticsReportHeader(field));
}

/** A row as the cells carry it, in column order, with everything the row does not name left empty. */
export function analyticsReportCells(row: Partial<AdminAnalyticsReportRow>): string[] {
  return ADMIN_ANALYTICS_REPORT_COLUMNS.map((field) => row[field] ?? "");
}

/**
 * The most rows one report writes.
 *
 * The same magnitude `ADMIN_RESOURCE_EXPORT_MAX_ROWS` names, for the same reason and with the same
 * refusal: a report holding the first figures of a range is a report claiming to be the range and is
 * not, which is the one outcome nothing downstream can detect from the bytes.
 *
 * Where it bites is not where a reader would guess. The read underneath is already refused above
 * `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ`, so the paths, the sources and the visitors a report can write
 * are each bounded by the events behind them. Only the daily series grows with something a host chose
 * rather than with traffic: a range of a hundred thousand days is a range, and it is a file of a
 * hundred thousand rows. That is what this refuses, and the message says so rather than blaming the
 * table.
 */
export const ADMIN_ANALYTICS_REPORT_MAX_ROWS = 50_000;

/** One visitor's row, which is the only place in a report that is a person rather than a figure. */
export type AdminAnalyticsReportVisitor = {
  /** The host's own key, written exactly as it was passed and not hashed here. */
  visitorKey: string;
  /** Visible events carrying the key. */
  views: number;
  /** The most recent visible event carrying it, or null for a row that carried no moment. */
  lastSeenAt: string | null;
};

/**
 * What a report holds, read back out of the file that states it.
 *
 * The totals and the rows are both here and are kept apart on purpose. A reader that filled the totals
 * from the rows would be checking nothing, so the totals are what the file *claims* and the four
 * tables are what it *says*, and the difference between them is what a host can check.
 */
export type AdminAnalyticsReportFigures = {
  /** What the file's own header block states, as the text each cell held. */
  manifest: Readonly<Record<string, string>>;
  /** The totals the file states. The rows beside them are what these are the total of. */
  totals: AdminAnalyticsReportTotals;
  series: AdminAnalyticsPoint[];
  paths: AdminAnalyticsTopPath[];
  sources: AdminAnalyticsSource[];
  visitors: AdminAnalyticsReportVisitor[];
};

/**
 * The figures the file states, which the rows above them have to add up to.
 *
 * Every one of them is written whatever sections the file holds, and read as a number or refused, so
 * a report whose totals can be absent is a report whose totals can disagree with its body. Each is
 * named after the field it comes from, so one figure has one name in the query layer, in the file and
 * in a reader, and a host checking a file against a tile is checking two spellings of one fact.
 *
 * **They are statements about the range, not about the file's layout.** A section the host left out is
 * still counted here, and its rows are in the file only when its section is, so a host reading the
 * figure off a download knows how many keys the range held rather than how many the file happened to
 * print. The manifest's `sections` row is what says which of these have rows above them to reconcile
 * against, and a check that reconciles a table the file does not hold is a check of nothing.
 */
export const ADMIN_ANALYTICS_REPORT_TOTALS = [
  "views",
  "visitors",
  "unattributed",
  "unkeyed",
  "series_rows",
  "paths",
  "paths_unkeyed",
  "sources",
  "sources_unattributed",
  "visitors_rows",
  "visitors_ungrouped",
] as const;

export type AdminAnalyticsReportTotal = (typeof ADMIN_ANALYTICS_REPORT_TOTALS)[number];

export type AdminAnalyticsReportTotals = {
  /** Events across the range, which is the sum of the series' own `views`. */
  views: number;
  /** Distinct keys across the range, deliberately not the sum of the series' `visitors`. */
  visitors: number;
  /** Views across the range that carried no key. */
  unattributed: number;
  /** Events the range cannot place on a day, in neither the points nor the totals. */
  unkeyed: number;
  /** Points over the range, one per distinct day in it, and the rows the series wrote. */
  seriesRows: number;
  /** Paths over the range, and the rows the paths section wrote. */
  paths: number;
  /** Events whose path was blank, in neither the path rows nor a count of paths. */
  pathsUnkeyed: number;
  /** Sources over the range, and the rows the sources section wrote. */
  sources: number;
  /** Events that carried no source, in neither the source rows nor a count of sources. */
  sourcesUnattributed: number;
  /** Distinct keys over the range, and the rows the visitors section wrote. */
  visitorsRows: number;
  /**
   * Events whose key was blank, in neither the visitor rows nor a count of visitors.
   *
   * The same as `unattributed` unless a key reached the table as a blank string, which the recorder
   * turns into `null` and a direct write past it does not. A blank is a key the series counts and the
   * ranking cannot list, so the two figures say so rather than disagreeing quietly: the difference
   * between this and `unattributed` is how many blanks there were.
   */
  visitorsUngrouped: number;
};

/**
 * The file's spelling of each total, against the field it lands in.
 *
 * A map rather than a naming rule, because a rule that derived one from the other would be a rule
 * both halves have to agree about, and this is the one place they are written down.
 */
const TOTAL_FIELDS: Readonly<Record<AdminAnalyticsReportTotal, keyof AdminAnalyticsReportTotals>> = {
  views: "views",
  visitors: "visitors",
  unattributed: "unattributed",
  unkeyed: "unkeyed",
  series_rows: "seriesRows",
  paths: "paths",
  paths_unkeyed: "pathsUnkeyed",
  sources: "sources",
  sources_unattributed: "sourcesUnattributed",
  visitors_rows: "visitorsRows",
  visitors_ungrouped: "visitorsUngrouped",
};

export function analyticsReportTotalField(metric: string): keyof AdminAnalyticsReportTotals | null {
  return Object.hasOwn(TOTAL_FIELDS, metric)
    ? TOTAL_FIELDS[metric as AdminAnalyticsReportTotal]
    : null;
}

/**
 * What the file's own header block states about itself, in the order it is written.
 *
 * The period first, because a figure with no period beside it is a number about an unknown span, and
 * the policy next, because a file holding figures a session may not have asked for has to say how it
 * came to hold them. `rows_withheld` is the row that keeps a refusal from reading as an empty site.
 */
export const ADMIN_ANALYTICS_REPORT_MANIFEST = [
  "range_from",
  "range_to",
  "range_days",
  "kind",
  "path_policy",
  "sections",
  "rounding",
  "rows_read",
  "rows_in_report",
  "rows_withheld",
] as const;

export type AdminAnalyticsReportManifestMetric = (typeof ADMIN_ANALYTICS_REPORT_MANIFEST)[number];

/**
 * The manifest rows a file cannot leave out, which is every one of them but the kind.
 *
 * A host that named no kind has no row for it, and a reader cannot tell "no kind was named" from "the
 * row was dropped", so the absence has to be the one thing the format allows to be absent.
 */
export const ADMIN_ANALYTICS_REPORT_REQUIRED_MANIFEST: readonly AdminAnalyticsReportManifestMetric[] =
  ADMIN_ANALYTICS_REPORT_MANIFEST.filter((metric) => metric !== "kind");
