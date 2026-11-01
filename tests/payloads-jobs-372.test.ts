// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { AdminPayloadAccessRefused } from "../src/payload/bridge";
import {
  createAdminPayloadScheduler,
  createAdminPayloadPagePublishHandler,
  PAYLOAD_PAGE_PUBLISH_TASK,
} from "../src/payload/scheduling";

type PayloadArgs = { collection: string; [key: string]: unknown };

function makeSpy(answer: (args: PayloadArgs) => Promise<unknown> = async () => ({ id: "1" })) {
  const calls: PayloadArgs[] = [];
  const fn = async (args: PayloadArgs) => {
    calls.push(args);
    return answer(args);
  };
  (fn as unknown as { calls: PayloadArgs[] }).calls = calls;
  return fn as unknown as ((args: PayloadArgs) => Promise<unknown>) & { calls: PayloadArgs[] };
}

function payloadStub(overrides: Partial<Record<string, (args: PayloadArgs) => Promise<unknown>>> = {}) {
  const base: Record<string, unknown> = {
    find: makeSpy(async () => ({ docs: [], totalDocs: 0 })),
    findByID: makeSpy(async () => ({ id: "1" })),
    create: makeSpy(async () => ({ id: "1" })),
    update: makeSpy(async () => ({ id: "1" })),
    delete: makeSpy(async () => ({ id: "1" })),
    jobs: {
      queue: makeSpy(async () => ({ id: "job-1" })),
      run: makeSpy(async () => ({ processed: 1 })),
      runByID: makeSpy(async () => ({ processed: 1 })),
      cancel: makeSpy(async () => undefined),
      cancelByID: makeSpy(async () => undefined),
      handleSchedules: makeSpy(async () => ({ scheduled: 0 })),
    },
  };
  for (const [key, value] of Object.entries(overrides)) {
    (base as Record<string, unknown>)[key] = makeSpy(value);
  }
  return base as unknown;
}

describe("payload jobs scheduler unauthorized operations", () => {
  it("refuses schedule, reschedule, cancel and run with no session before reaching payload", async () => {
    const payload = payloadStub() as { jobs: { queue: { calls: PayloadArgs[] } } };
    const scheduler = createAdminPayloadScheduler({
      payload: payload as never,
      resolveUser: async () => null,
    });

    await expect(scheduler.schedule({ collection: "pages", id: "1", publishAt: new Date("2026-11-02T10:00:00Z") })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(scheduler.reschedule({ id: "job-1", publishAt: new Date("2026-11-03T10:00:00Z") })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(scheduler.cancel({ id: "job-1" })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(scheduler.run()).rejects.toBeInstanceOf(AdminPayloadAccessRefused);

    expect(payload.jobs.queue.calls).toHaveLength(0);
  });
});

describe("payload jobs scheduler", () => {
  it("queues a page with overrideAccess false and the session user", async () => {
    const payload = payloadStub() as { jobs: { queue: { calls: PayloadArgs[] } } };
    const scheduler = createAdminPayloadScheduler({
      payload: payload as never,
      resolveUser: async () => ({ id: "u1" }),
    });

    await scheduler.schedule({ collection: "pages", id: "42", publishAt: "2026-11-02T10:00:00" });

    const args = payload.jobs.queue.calls[0]!;
    expect(args.task).toBe(PAYLOAD_PAGE_PUBLISH_TASK);
    expect(args.input).toEqual({ collection: "pages", id: "42" });
    expect(args.overrideAccess).toBe(false);
    expect((args.req as { user: { id: string } }).user).toEqual({ id: "u1" });
    expect(args.waitUntil).toBeInstanceOf(Date);
  });

  it("carries the access check on cancel and run", async () => {
    const payload = payloadStub() as {
      jobs: { cancelByID: { calls: PayloadArgs[] }; run: { calls: PayloadArgs[] } };
    };
    const scheduler = createAdminPayloadScheduler({
      payload: payload as never,
      resolveUser: async () => ({ id: "u1" }),
    });

    await scheduler.cancel({ id: "job-9" });
    await scheduler.run({ limit: 5 });

    const cancelArgs = payload.jobs.cancelByID.calls[0]!;
    expect(cancelArgs.id).toBe("job-9");
    expect(cancelArgs.overrideAccess).toBe(false);
    expect((cancelArgs.req as { user: { id: string } }).user).toEqual({ id: "u1" });

    const runArgs = payload.jobs.run.calls[0]!;
    expect(runArgs.overrideAccess).toBe(false);
    expect((runArgs.req as { user: { id: string } }).user).toEqual({ id: "u1" });
  });

  it("denies a caller lacking publish permission through the handler", async () => {
    const payload = {
      findByID: vi.fn(async () => ({ id: "1" })),
      update: vi.fn(async () => {
        throw new Error("You are not allowed to perform this operation.");
      }),
    };
    const handler = createAdminPayloadPagePublishHandler({ payload: payload as never });
    await expect(
      handler({ input: { collection: "pages", id: "1" }, req: { user: { id: "u1" }, payload: payload as never } }),
    ).rejects.toThrow(/not allowed/);
    expect(payload.update).toHaveBeenCalled();
  });

  it("reports a stale or deleted page", async () => {
    const payload = {
      findByID: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: "1" })),
    };
    const handler = createAdminPayloadPagePublishHandler({ payload: payload as never });
    await expect(
      handler({ input: { collection: "pages", id: "999" }, req: { user: { id: "u1" }, payload: payload as never } }),
    ).rejects.toThrow(/no longer exists/);
    expect(payload.update).not.toHaveBeenCalled();
  });
});