// SPDX-License-Identifier: MIT

/**
 * A range of analytics as a report a person opens in a spreadsheet, with the permission seam the
 * figures need rather than the one rows need.
 *
 * Separate from the resource export because the two answer different questions and refuse differently.
 * That one is a list a reader is looking at, scoped by a rule about rows and capped because a hundred
 * thousand rows is a file nobody can open. This one is a period of figures, whose read is already
 * refused above `ADMIN_ANALYTICS_MAX_EVENTS_PER_READ` and whose dangerous disclosure is a path rather
 * than a row, so the check it takes is a decision about a path and the default when a host has not
 * supplied one is to withhold every path and say so in the file.
 */
export { ADMIN_ANALYTICS_REPORT_MAX_ROWS } from "./format.js";
export {
  ADMIN_ANALYTICS_REPORT_DEFAULT_SECTIONS,
  ADMIN_ANALYTICS_REPORT_SECTIONS,
} from "./format.js";
export type {
  AdminAnalyticsReportFigures,
  AdminAnalyticsReportSection,
  AdminAnalyticsReportTotals,
  AdminAnalyticsReportVisitor,
} from "./format.js";
export { adminAnalyticsReport, adminAnalyticsReportResponse } from "./report.js";
export type {
  AdminAnalyticsPathPolicy,
  AdminAnalyticsReport,
  AdminAnalyticsReportOptions,
  AdminAnalyticsReportOptionsWithName,
} from "./report.js";
export { adminAnalyticsReportFigures } from "./figures.js";
