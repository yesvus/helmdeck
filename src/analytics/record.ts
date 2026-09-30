// SPDX-License-Identifier: MIT

/**
 * Writing an event, one at a time or held until there are several.
 *
 * What this costs, stated once: one `record` is one `create`, which is one round trip to the store.
 * A buffered recorder is what makes that affordable on a page view, because `record` returns without
 * waiting for it and `flush` issues what was held. Buffering changes when the write happens and
 * whether one statement carries it, never how many rows are written: a store with a `createMany`
 * takes the whole batch as one round trip, and one without it takes one round trip per row, run
 * together rather than one after another. Which of those a host has is the difference between a
 * counter a site can afford on every view and one it can afford on a cron.
 *
 * A write that fails must not fail the page that triggered it, because a counter that can take a
 * page down is worse than no counter. `record` therefore never throws and never returns a promise
 * that rejects, and every failure goes to the two places a host can read it: the `onError` given
 * here, and the bounded `failures` on the recorder itself. A refusal from a field check lands in the
 * same place and is distinguishable from a store that was down, because it is an `AdminAnalyticsError`.
 */

import { ADMIN_ANALYTICS_RESOURCE, adminAnalyticsEventValue, type AdminAnalyticsEvent, type AdminAnalyticsEventRow, type AdminAnalyticsEventValue, type AdminAnalyticsUnkeyed } from "./events.js";
import type { AdminPersistenceAdapter } from "../adapters/host.js";

/**
 * A store that can write many rows as one statement, which is the only way batching saves round
 * trips rather than only latency.
 *
 * Optional because `AdminPersistenceAdapter` has no such method and every host satisfies this type
 * unchanged without it. A store that does have one gets a batch per flush; a store that does not
 * gets the same rows, one `create` each, overlapping rather than serial.
 */
export type AdminAnalyticsBatchStore = AdminPersistenceAdapter & {
  createMany?: (resource: string, values: readonly unknown[]) => Promise<void>;
};

export type AdminAnalyticsRecordOptions = {
  /** The moment an event without a time of its own is stamped with. Defaults to the wall clock. */
  now?: () => Date;
  /**
   * What to do with an event the host supplied no key for.
   *
   * The default counts it. Counting a view records that a request happened and nothing about who
   * made it, so it is not a tracking decision and this package does not get to make it on a host's
   * behalf. A host that has decided no row is written without a key passes `"drop"`, and this layer
   * asks for the key rather than inventing one.
   */
  unkeyed?: AdminAnalyticsUnkeyed;
};

/**
 * One event written, and the row the store answered with, or null when an unkeyed event was dropped.
 *
 * Awaiting this puts the round trip on the request that recorded the view. It throws rather than
 * swallowing, so a host that wants a hard failure rather than a missed view has one, and the
 * recorder below is for the host that does not.
 */
export async function adminAnalyticsRecord<T = AdminAnalyticsEventRow>(
  store: Pick<AdminPersistenceAdapter, "create">,
  event: AdminAnalyticsEvent,
  options: AdminAnalyticsRecordOptions = {},
): Promise<T | null> {
  const value = adminAnalyticsEventValue(event, options);
  if (options.unkeyed === "drop" && value.visitor_key === null) return null;
  return store.create<T>(ADMIN_ANALYTICS_RESOURCE, value);
}

/** How many events one write holds, and so how many round trips a flush makes at worst. */
export const ADMIN_ANALYTICS_BATCH_SIZE = 25;

/** How many past failures a recorder keeps for a host that reads them rather than wiring a sink. */
export const ADMIN_ANALYTICS_FAILURE_HISTORY = 20;

/** One batch that did not land, with the events it was carrying and why it did not. */
export type AdminAnalyticsWriteFailure = {
  events: readonly AdminAnalyticsEvent[];
  /** The store's own error, or the `AdminAnalyticsError` a field check raised. */
  error: unknown;
};

/** What one flush managed, so a host can see a store that has stopped accepting writes. */
export type AdminAnalyticsWriteResult = {
  /** Events the store took. */
  written: number;
  /** Events it did not, each of which is also in `failures`. */
  failed: number;
  /** The first failure, for a caller that is not reading the rest. */
  error?: unknown;
  /** Events still held, so a host knows another flush is owed. */
  pending: number;
};

export type AdminAnalyticsRecorderOptions = AdminAnalyticsRecordOptions & {
  /** How many events one write holds. */
  batchSize?: number;
  /** How many past failures to keep. */
  failureHistory?: number;
  /**
   * Where a failure goes as it happens, for a host with a logger.
   *
   * A throw out of here is caught and kept as a failure like any other, because this is the one
   * callback a page view reaches and a callback that throws must not become the failure.
   */
  onError?: (failure: AdminAnalyticsWriteFailure) => void;
};

export type AdminAnalyticsRecorder = {
  /**
   * Holds the event and returns. Never throws, and never returns a promise that rejects, so a page
   * view can call it without a `catch` and without waiting for the store.
   */
  record: (event: AdminAnalyticsEvent) => void;
  /** Writes everything held, and what it managed. Writes nothing, and asks nothing, when empty. */
  flush: () => Promise<AdminAnalyticsWriteResult>;
  /** Events held and not yet written. */
  pending: number;
  /** The failures, oldest first, up to the recorder's history. */
  failures: readonly AdminAnalyticsWriteFailure[];
};

/**
 * A recorder to hold events for a host that cannot spend a round trip on a page view.
 *
 * Nothing is written until `flush`, so a host calls it from wherever it already batches: the end of
 * a request, a timer, the end of a process. A process that exits without flushing loses what it
 * held, which is the cost of not writing on the request and is said here rather than discovered.
 */
export function createAdminAnalyticsRecorder(
  store: AdminAnalyticsBatchStore,
  options: AdminAnalyticsRecorderOptions = {},
): AdminAnalyticsRecorder {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? ADMIN_ANALYTICS_BATCH_SIZE));
  const history = Math.max(0, Math.floor(options.failureHistory ?? ADMIN_ANALYTICS_FAILURE_HISTORY));
  const unkeyed = options.unkeyed ?? "count";

  let buffer: AdminAnalyticsEvent[] = [];
  const failures: AdminAnalyticsWriteFailure[] = [];

  function fail(events: readonly AdminAnalyticsEvent[], error: unknown): void {
    const failure: AdminAnalyticsWriteFailure = { events, error };
    failures.push(failure);
    // Bounded, so a store that has been down all afternoon does not take the process with it.
    while (failures.length > history) failures.shift();
    if (options.onError === undefined) return;
    try {
      options.onError(failure);
    } catch {
      // A sink that throws is dropped rather than recorded. Recording it would call the sink again,
      // and a sink that throws once throws again, so the counter would be the thing taking the
      // process down. The failure it was told about is already in `failures`, which is the part a
      // host can still read.
    }
  }

  /**
   * One batch, with every refusal inside it attributed to the events that caused it.
   *
   * Refusals are separated from the store's answer rather than batched with it, so a dropped event
   * does not make a write that succeeded look like one that failed.
   */
  async function write(
    batch: readonly AdminAnalyticsEvent[],
  ): Promise<{ written: number; failed: number; error?: unknown }> {
    const values: AdminAnalyticsEventValue[] = [];
    const events: AdminAnalyticsEvent[] = [];

    for (const event of batch) {
      let value: AdminAnalyticsEventValue;
      try {
        value = adminAnalyticsEventValue(event, options);
      } catch (error) {
        fail([event], error);
        continue;
      }
      if (unkeyed === "drop" && value.visitor_key === null) continue;
      values.push(value);
      events.push(event);
    }

    if (values.length === 0) return { written: 0, failed: 0 };

    if (store.createMany !== undefined) {
      try {
        await store.createMany(ADMIN_ANALYTICS_RESOURCE, values);
        return { written: values.length, failed: 0 };
      } catch (error) {
        // A batch write is one statement, so a rejection says nothing about which of these rows the
        // store took. All of them are reported as failed, because a count claiming rows landed when
        // the store said it took none is a figure nobody can check.
        fail(events, error);
        return { written: 0, failed: values.length, error };
      }
    }

    const settled = await Promise.allSettled(
      values.map((value) => store.create(ADMIN_ANALYTICS_RESOURCE, value)),
    );
    let written = 0;
    let failed = 0;
    let firstError: unknown;
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        written += 1;
        return;
      }
      failed += 1;
      if (firstError === undefined) firstError = outcome.reason;
      fail([events[index]!], outcome.reason);
    });
    return firstError === undefined ? { written, failed } : { written, failed, error: firstError };
  }

  return {
    record(event: AdminAnalyticsEvent) {
      buffer.push(event);
    },

    async flush(): Promise<AdminAnalyticsWriteResult> {
      if (buffer.length === 0) return { written: 0, failed: 0, pending: 0 };
      const batch = buffer.slice(0, batchSize);
      buffer = buffer.slice(batch.length);
      const result = await write(batch);
      return {
        written: result.written,
        failed: result.failed,
        pending: buffer.length,
        ...(result.error === undefined ? {} : { error: result.error }),
      };
    },

    get pending() {
      return buffer.length;
    },

    get failures() {
      return failures;
    },
  };
}
