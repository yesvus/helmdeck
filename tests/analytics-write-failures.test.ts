// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_ANALYTICS_PAGE_VIEW,
  ADMIN_ANALYTICS_RESOURCE,
  AdminAnalyticsError,
  adminAnalyticsRecord,
  adminAnalyticsRead,
  createAdminAnalyticsRecorder,
} from "../src/analytics";
import type { AdminAnalyticsBatchStore, AdminAnalyticsWriteFailure } from "../src/analytics";
import type { AdminPersistenceAdapter } from "../src/adapters";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";

/**
 * What a counter does when the store is not answering.
 *
 * A page view is the one write an admin makes on a request the visitor is already waiting for, so a
 * store that is down must not become a 500 on a page that was about to render. Every assertion here
 * is the two halves of that at once: the call returns, and the host can still see that it failed.
 * A test that only checked the first would pass against a recorder that swallowed the error, which
 * is the failure this file exists to catch.
 */

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CLOCK = () => NOW;

function view(over: Record<string, unknown> = {}) {
  return { kind: ADMIN_ANALYTICS_PAGE_VIEW, path: "/pricing", ...over } as never;
}

/** A store whose `create` fails the way a database that is down fails, and counts the attempts. */
function failingStore(error: unknown) {
  const inner = createMemoryPersistenceAdapter();
  const attempts: number[] = [];
  const store: AdminAnalyticsBatchStore = {
    ...inner,
    async create<T>(): Promise<T> {
      attempts.push(1);
      throw error;
    },
  };
  return { store, attempts };
}

describe("a write that fails does not fail the page", () => {
  it("returns from record and reports the failure to the host's sink", async () => {
    const seen: AdminAnalyticsWriteFailure[] = [];
    const { store } = failingStore(new Error("the database is unreachable"));

    const recorder = createAdminAnalyticsRecorder(store, {
      now: CLOCK,
      onError: (failure) => seen.push(failure),
    });

    // The call a page view makes. No await, no catch, no rejection: if this threw, the view took the
    // page down with it.
    expect(() => recorder.record(view({ visitorKey: "v-1" }))).not.toThrow();
    expect(recorder.pending).toBe(1);

    const result = await recorder.flush();

    expect(result.written).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(0);
    // The sink got it, with the event it was carrying and the store's own reason.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.error).toBeInstanceOf(Error);
    expect((seen[0]!.error as Error).message).toBe("the database is unreachable");
    expect(seen[0]!.events).toHaveLength(1);
  });

  it("keeps the failure on the recorder for a host that wired no sink", async () => {
    const { store } = failingStore(new Error("the database is unreachable"));
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK });

    recorder.record(view());
    await recorder.flush();

    // Readable after the fact rather than gone. A host that neither wires a sink nor reads this has
    // chosen not to know, which is the one outcome that is the host's own decision.
    expect(recorder.failures).toHaveLength(1);
    expect((recorder.failures[0]!.error as Error).message).toBe("the database is unreachable");
  });

  it("does not let a sink that throws become the failure", async () => {
    const { store } = failingStore(new Error("the database is unreachable"));
    let calls = 0;
    const recorder = createAdminAnalyticsRecorder(store, {
      now: CLOCK,
      onError: () => {
        calls += 1;
        throw new Error("the logger is down too");
      },
    });

    recorder.record(view());
    await expect(recorder.flush()).resolves.toMatchObject({ written: 0, failed: 1 });

    // The sink is called once and never re-entered: recording its own failure would call it again,
    // and a sink that throws once throws again.
    expect(calls).toBe(1);
    // The write failure is still readable, which is the part a host can act on.
    expect(recorder.failures).toHaveLength(1);
    expect((recorder.failures[0]!.error as Error).message).toBe("the database is unreachable");
  });

  it("keeps recording after a failure rather than poisoning the recorder", async () => {
    const inner = createMemoryPersistenceAdapter();
    let broken = true;
    const store: AdminAnalyticsBatchStore = {
      ...inner,
      async create<T>(resource: string, value: unknown): Promise<T> {
        if (broken) throw new Error("the database is unreachable");
        return inner.create<T>(resource, value);
      },
    };

    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK });
    recorder.record(view({ visitorKey: "v-1" }));
    expect(await recorder.flush()).toMatchObject({ written: 0, failed: 1 });

    broken = false;
    recorder.record(view({ visitorKey: "v-2" }));
    expect(await recorder.flush()).toMatchObject({ written: 1, failed: 0 });
    expect(await adminAnalyticsRead(store)).toHaveLength(1);
  });

  it("reports a refused field beside a store that was down, and the two are told apart", async () => {
    const store = createMemoryPersistenceAdapter();
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK });

    // No path to group the event by, and one that is fine.
    recorder.record(view({ path: "" }));
    recorder.record(view({ visitorKey: "v-1" }));

    const result = await recorder.flush();
    // The refusal is not a failed write: the other event landed, and calling it a failure would tell
    // a host its store is down when it is answering perfectly.
    expect(result.written).toBe(1);
    expect(result.failed).toBe(0);
    expect(recorder.failures).toHaveLength(1);
    expect(recorder.failures[0]!.error).toBeInstanceOf(AdminAnalyticsError);
    expect((recorder.failures[0]!.error as Error).message).toMatch(/path is missing/);
  });

  it("throws from the strict call, for a host that would rather know on the request", async () => {
    const { store, attempts } = failingStore(new Error("the database is unreachable"));
    await expect(adminAnalyticsRecord(store, view(), { now: CLOCK })).rejects.toThrow(
      "the database is unreachable",
    );
    expect(attempts).toHaveLength(1);
  });
});

describe("what a flush costs, and what batching changes", () => {
  it("writes nothing and asks the store nothing when nothing was held", async () => {
    const inner = createMemoryPersistenceAdapter();
    const create = vi.spyOn(inner, "create");
    const recorder = createAdminAnalyticsRecorder(inner, { now: CLOCK });

    expect(await recorder.flush()).toEqual({ written: 0, failed: 0, pending: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it("holds the round trip off record, so a page view does not await a write", async () => {
    const inner = createMemoryPersistenceAdapter();
    const create = vi.spyOn(inner, "create");
    const recorder = createAdminAnalyticsRecorder(inner, { now: CLOCK });

    recorder.record(view({ visitorKey: "v-1" }));
    // The cost of one view so far: nothing has been written and nothing has been awaited.
    expect(create).not.toHaveBeenCalled();
    expect(recorder.pending).toBe(1);

    await recorder.flush();
    // One event, one create. This is the per-event cost stated as a measurement rather than a claim.
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toBe(ADMIN_ANALYTICS_RESOURCE);
  });

  it("takes a whole batch as one call where the store can, and one per row where it cannot", async () => {
    const plain = createMemoryPersistenceAdapter();
    const perRow = vi.spyOn(plain, "create");
    const batched = createAdminAnalyticsRecorder(plain, { now: CLOCK, batchSize: 10 });
    for (let index = 0; index < 3; index += 1) batched.record(view({ path: `/p${index}` }));
    expect(await batched.flush()).toMatchObject({ written: 3 });
    // Three rows and three calls: the cost a store with no batch method pays.
    expect(perRow).toHaveBeenCalledTimes(3);

    const one = createMemoryPersistenceAdapter();
    const oneByOne = vi.spyOn(one, "create");
    const batches: unknown[][] = [];
    const store: AdminAnalyticsBatchStore = {
      ...one,
      async createMany(resource, values) {
        batches.push([resource, ...values]);
      },
    };
    const grouped = createAdminAnalyticsRecorder(store, { now: CLOCK, batchSize: 10 });
    for (let index = 0; index < 3; index += 1) grouped.record(view({ path: `/p${index}` }));
    const result = await grouped.flush();

    // Three rows, one round trip. This is the whole difference batching makes, and it is only
    // available to a host whose store offers the call.
    expect(batches).toHaveLength(1);
    expect(batches[0]![0]).toBe(ADMIN_ANALYTICS_RESOURCE);
    expect(batches[0]!.slice(1)).toHaveLength(3);
    expect(result.written).toBe(3);
    // And the store's own per-row write was not used at all, which is the round trip saved.
    expect(oneByOne).not.toHaveBeenCalled();
  });

  it("reports a rejected batch as no rows written, because the store said it took none", async () => {
    const one = createMemoryPersistenceAdapter();
    const store: AdminAnalyticsBatchStore = {
      ...one,
      createMany: async () => {
        throw new Error("too many variables");
      },
    };
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK });
    recorder.record(view());
    recorder.record(view({ path: "/other" }));

    const result = await recorder.flush();
    // A batch write is one statement, so a rejection says nothing about which rows landed. Claiming
    // the two were written would be a figure no host could check against the table.
    expect(result.written).toBe(0);
    expect(result.failed).toBe(2);
    expect((result.error as Error).message).toBe("too many variables");
  });

  it("takes one batch per flush and says how many are still held", async () => {
    const store = createMemoryPersistenceAdapter();
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK, batchSize: 2 });
    for (let index = 0; index < 5; index += 1) recorder.record(view({ path: `/p${index}` }));

    expect(await recorder.flush()).toMatchObject({ written: 2, pending: 3 });
    expect(await recorder.flush()).toMatchObject({ written: 2, pending: 1 });
    expect(await recorder.flush()).toMatchObject({ written: 1, pending: 0 });
    expect(await adminAnalyticsRead(store)).toHaveLength(5);
  });

  it("keeps two identical events as two rows rather than folding them into one", async () => {
    const store = createMemoryPersistenceAdapter();
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK });
    // The same path, the same key, the same moment: two views of one page in one request, or a
    // double-submitted form. A recorder that deduplicated them would report one view.
    recorder.record(view({ visitorKey: "v-1", at: "2026-09-29T09:00:00.000Z" }));
    recorder.record(view({ visitorKey: "v-1", at: "2026-09-29T09:00:00.000Z" }));

    expect(await recorder.flush()).toMatchObject({ written: 2, failed: 0 });
    expect(await adminAnalyticsRead(store)).toHaveLength(2);
  });

  it("drops an unkeyed event without reporting a failure, when the host has said not to write one", async () => {
    const store = createMemoryPersistenceAdapter();
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK, unkeyed: "drop" });

    recorder.record(view());
    recorder.record(view({ visitorKey: "v-1" }));

    // One write, one refusal-free flush: an event the host declined is not a failure to report.
    expect(await recorder.flush()).toEqual({ written: 1, failed: 0, pending: 0 });
    expect(recorder.failures).toHaveLength(0);
  });

  it("keeps a bounded history so a store down all afternoon does not take the process with it", async () => {
    const { store } = failingStore(new Error("the database is unreachable"));
    const recorder = createAdminAnalyticsRecorder(store, { now: CLOCK, failureHistory: 2 });

    for (let index = 0; index < 5; index += 1) {
      recorder.record(view());
      await recorder.flush();
    }
    expect(recorder.failures).toHaveLength(2);
  });
});

describe("a recorder over a store that cannot be asked twice", () => {
  it("still refuses an oversized read rather than truncating it", async () => {
    // The rows-only store shape, which is what a host with a plain adapter has: `queryPage` absent,
    // so the read is made over the whole resource. The refusal is what keeps that honest.
    const rowsOnly: AdminPersistenceAdapter = createMemoryPersistenceAdapter();
    await adminAnalyticsRecord(rowsOnly, view(), { now: CLOCK });

    const read = await adminAnalyticsRead(rowsOnly, { maxEvents: 1 });
    expect(read).toHaveLength(1);
    await expect(adminAnalyticsRead(rowsOnly, { maxEvents: 0 })).rejects.toThrow(/whole number from one up/);
  });
});
