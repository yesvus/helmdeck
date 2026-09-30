// SPDX-License-Identifier: MIT

/**
 * Recording what a visitor did, and reading it back as the figures a chart draws.
 *
 * Two halves over `AdminPersistenceAdapter`, and a host owns the two decisions that matter on both
 * sides of it. The visitor key is the host's value: nothing here derives one, hashes one, or falls
 * back to one, so whether a visitor may be tracked at all is decided where the key is made. The
 * retention window is the host's number: a prune takes the window it was given, and there is no
 * default to accept by accident.
 */
export { ADMIN_ANALYTICS_RESOURCE, ADMIN_ANALYTICS_PAGE_VIEW, AdminAnalyticsError, adminAnalyticsInstant, adminAnalyticsEventValue, ADMIN_ANALYTICS_MAX_KIND, ADMIN_ANALYTICS_MAX_PATH, ADMIN_ANALYTICS_MAX_VISITOR_KEY, ADMIN_ANALYTICS_MAX_SOURCE } from "./events.js";
export type { AdminAnalyticsEvent, AdminAnalyticsEventRow, AdminAnalyticsEventValue, AdminAnalyticsEventOptions, AdminAnalyticsUnkeyed } from "./events.js";
export {
  ADMIN_ANALYTICS_BATCH_SIZE,
  ADMIN_ANALYTICS_FAILURE_HISTORY,
  adminAnalyticsRecord,
  createAdminAnalyticsRecorder,
} from "./record.js";
export type {
  AdminAnalyticsBatchStore,
  AdminAnalyticsRecordOptions,
  AdminAnalyticsRecorder,
  AdminAnalyticsRecorderOptions,
  AdminAnalyticsWriteFailure,
  AdminAnalyticsWriteResult,
} from "./record.js";
export {
  ADMIN_ANALYTICS_MAX_EVENTS_PER_READ,
  adminAnalyticsRead,
  adminAnalyticsRetain,
  adminAnalyticsSeries,
  adminAnalyticsSources,
  adminAnalyticsTopPaths,
} from "./query.js";
export type {
  AdminAnalyticsPoint,
  AdminAnalyticsReadOptions,
  AdminAnalyticsRetainOptions,
  AdminAnalyticsRetention,
  AdminAnalyticsSeries,
  AdminAnalyticsSeriesOptions,
  AdminAnalyticsSource,
  AdminAnalyticsSources,
  AdminAnalyticsSourcesOptions,
  AdminAnalyticsTopPath,
  AdminAnalyticsTopPaths,
  AdminAnalyticsTopPathsOptions,
  AdminAnalyticsTotals,
} from "./query.js";
