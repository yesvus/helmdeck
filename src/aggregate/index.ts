// SPDX-License-Identifier: MIT

/** Bucketing a host's rows into a chart's points and the totals those points add up to. */
export { adminAggregate, adminAggregateTotals, adminWholeNumber } from "./aggregate.js";
export type {
  AdminAggregateBucket,
  AdminAggregateMeasures,
  AdminAggregateOptions,
  AdminAggregateResult,
  AdminAggregateTotalsOptions,
} from "./aggregate.js";
