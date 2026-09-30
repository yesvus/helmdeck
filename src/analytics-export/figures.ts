// SPDX-License-Identifier: MIT

/**
 * A report file, read back as the figures it states.
 *
 * The format is the only contract between this package and the person who opens the file in a
 * spreadsheet, so it is read here rather than left to the first host that needs to. A host that wants
 * to import a report, to check one, or to show a summary beside a download reads it with this, and
 * gets the same refusal a broken file deserves rather than figures it invented.
 *
 * **The totals and the rows come back apart, on purpose.** `totals` is what the file claims and the
 * four tables are what it says, and a reader that computed one from the other would be checking
 * nothing at all. The identities between them are the package's test, not this function's assertion:
 * a file whose totals disagree with its rows reads the same as a file whose totals agree, and the
 * difference is exactly what a host has to be able to see.
 */

import { AdminAnalyticsError } from "../analytics/events.js";
import { adminCsvText } from "../export/csv.js";
import { adminCsvRecords, type AdminCsvSource } from "../import/csv.js";
import {
  ADMIN_ANALYTICS_REPORT_COLUMNS,
  ADMIN_ANALYTICS_REPORT_REQUIRED_MANIFEST,
  ADMIN_ANALYTICS_REPORT_SECTIONS,
  ADMIN_ANALYTICS_REPORT_TOTALS,
  analyticsReportHeader,
  analyticsReportTotalField,
  type AdminAnalyticsReportFigures,
  type AdminAnalyticsReportRow,
  type AdminAnalyticsReportTotals,
  type AdminAnalyticsReportVisitor,
} from "./format.js";

/** The column each field is read from, or -1 when the file has no such column. */
type Index = Readonly<Record<(typeof ADMIN_ANALYTICS_REPORT_COLUMNS)[number], number>>;

function refuse(reason: string): never {
  throw new AdminAnalyticsError(`this file is not a report that can be read: ${reason}`);
}

/**
 * The header, as the map a row is read by.
 *
 * Every column this format writes has to be present, and a column it does not know is left alone, so
 * a person who added a column of their own in a spreadsheet can still read the file back. A missing
 * column is refused rather than read as empty: a figure with nowhere to live is a figure the file
 * cannot be said to state, and a default would be a number this package made up.
 */
function indexOf(cells: readonly string[]): Index {
  const found = new Map<string, number>();
  cells.forEach((cell, at) => {
    const name = adminCsvText(cell);
    if (!found.has(name)) found.set(name, at);
  });
  const index = {} as Record<(typeof ADMIN_ANALYTICS_REPORT_COLUMNS)[number], number>;
  const missing: string[] = [];
  for (const field of ADMIN_ANALYTICS_REPORT_COLUMNS) {
    const at = found.get(analyticsReportHeader(field));
    if (at === undefined) missing.push(analyticsReportHeader(field));
    else index[field] = at;
  }
  if (missing.length > 0) {
    refuse(`the header row is missing ${missing.join(", ")}. A report states every figure it claims.`);
  }
  return index;
}

/** A row as its cells carry it, with the writer's mark of "this is text" taken off. */
function rowOf(cells: readonly string[], index: Index): AdminAnalyticsReportRow {
  const row = {} as AdminAnalyticsReportRow;
  for (const field of ADMIN_ANALYTICS_REPORT_COLUMNS) {
    const cell = cells[index[field]];
    (row as Record<string, string>)[field] = cell === undefined ? "" : adminCsvText(cell);
  }
  return row;
}

/**
 * A count, as a whole number, or a refusal.
 *
 * Empty is refused rather than read as zero, because `Number("")` is zero and a total that had been
 * dropped out of a file would then read as a site nobody visited rather than as a file that does not
 * add up. Anything past the largest exact integer is refused for the reason the aggregation refuses
 * it: the number would be wrong by an amount nothing downstream can detect.
 */
function count(cell: string, what: string): number {
  if (cell === "") refuse(`the ${what} is empty, which is a figure a file cannot leave out.`);
  const value = Number(cell);
  if (!Number.isSafeInteger(value) || value < 0) {
    refuse(`the ${what} is ${JSON.stringify(cell)}, which is not a whole number from zero up.`);
  }
  return value;
}

/** Text a row has to be carrying, or a refusal, because a row with no key in it is not a row. */
function text(cell: string, what: string): string {
  if (cell === "") refuse(`a ${what} row carries no value.`);
  return cell;
}

/** A moment a row states, which may be absent for a row the store held no moment for. */
function moment(cell: string): string | null {
  return cell === "" ? null : cell;
}

/**
 * The report a file states, or a refusal naming what is wrong with it.
 *
 * Strict where a spreadsheet is forgiving, because the two jobs are different: a spreadsheet opens a
 * file with a column missing and shows what it can, and this reads a file and answers questions about
 * what it says, so a file whose header, totals or counts do not hold together is refused rather than
 * half read. A reader that filled in what was missing would report a figure the file never stated.
 *
 * The order of the rows is the order the file has them in, and the file is the writer's order, so a
 * round trip returns the same sequence and not merely the same set.
 */
export async function adminAnalyticsReportFigures(source: AdminCsvSource): Promise<AdminAnalyticsReportFigures> {
  const manifest: Record<string, string> = {};
  const totals = {} as Record<keyof AdminAnalyticsReportTotals, number>;
  const series: AdminAnalyticsReportFigures["series"] = [];
  const paths: AdminAnalyticsReportFigures["paths"] = [];
  const sources: AdminAnalyticsReportFigures["sources"] = [];
  const visitors: AdminAnalyticsReportVisitor[] = [];

  let index: Index | null = null;
  for await (const record of adminCsvRecords(source)) {
    if (record.error !== null) refuse(`line ${record.line} does not read: ${record.error}`);
    if (index === null) {
      index = indexOf(record.cells);
      continue;
    }
    const row = rowOf(record.cells, index);
    switch (row.section) {
      case "manifest":
        if (row.metric === "") refuse(`line ${record.line} is a manifest row naming no metric.`);
        manifest[row.metric] = row.value;
        break;
      case "total": {
        const field = analyticsReportTotalField(row.metric);
        if (field === null) refuse(`line ${record.line} states a total of ${JSON.stringify(row.metric)}, which is not one.`);
        if (Object.hasOwn(totals, field)) {
          refuse(`line ${record.line} states ${JSON.stringify(row.metric)} again. One figure stated twice is two answers to one question.`);
        }
        totals[field] = count(row.value, `total of ${row.metric}`);
        break;
      }
      case "series":
        series.push({
          key: text(row.day, "series"),
          label: row.label,
          views: count(row.views, "views of a series row"),
          visitors: count(row.visitors, "visitors of a series row"),
          unattributed: count(row.unattributed, "unattributed of a series row"),
        });
        break;
      case "paths":
        paths.push({
          path: text(row.path, "paths"),
          views: count(row.views, "views of a paths row"),
          lastViewedAt: moment(row.lastSeenAt),
        });
        break;
      case "sources":
        sources.push({
          source: text(row.source, "sources"),
          label: row.label,
          views: count(row.views, "views of a sources row"),
        });
        break;
      case "visitors":
        visitors.push({
          visitorKey: text(row.visitorKey, "visitors"),
          views: count(row.views, "views of a visitors row"),
          lastSeenAt: moment(row.lastSeenAt),
        });
        break;
      case "":
        refuse(`line ${record.line} names no section, so it belongs to no figure.`);
        break;
      default:
        refuse(`line ${record.line} is in ${JSON.stringify(row.section)}, which is not one of ${ADMIN_ANALYTICS_REPORT_SECTIONS.join(", ")}.`);
    }
  }
  if (index === null) refuse("the file holds no header row, so it holds no columns to read a figure from.");

  const absent = ADMIN_ANALYTICS_REPORT_REQUIRED_MANIFEST.filter((metric) => !Object.hasOwn(manifest, metric));
  if (absent.length > 0) {
    refuse(`the file states no ${absent.join(", ")}. A report says what it covers and how it came to hold it.`);
  }
  const unstated = ADMIN_ANALYTICS_REPORT_TOTALS.filter((metric) => !Object.hasOwn(totals, analyticsReportTotalField(metric)!));
  if (unstated.length > 0) {
    refuse(`the file states no total of ${unstated.join(", ")}. A report whose totals can be absent is a report whose totals can disagree with its rows.`);
  }

  return { manifest, totals, series, paths, sources, visitors };
}
