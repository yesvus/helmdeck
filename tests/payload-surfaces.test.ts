// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createAdminPayloadContent } from "../src/payload/bridge";
import { createAdminPayloadPersistenceAdapter } from "../src/payload/store";
import { createAdminPayloadMediaAdapter } from "../src/payload/media";
import {
  createAdminPayloadActivityLoader,
  createAdminPayloadCountLoader,
} from "../src/payload/loaders";

type PayloadArgs = { collection: string; [key: string]: unknown };

/** A stub that remembers what it was called with, which is where the access check is read. */
function spy(answer: (args: PayloadArgs) => Promise<unknown> = async () => ({ id: "1" })) {
  const calls: PayloadArgs[][] = [];
  const fn = async (args: PayloadArgs) => {
    calls.push([args]);
    return answer(args);
  };
  return Object.assign(fn, { mock: { calls } });
}

type PayloadStub = {
  find: ReturnType<typeof spy>;
  findByID: ReturnType<typeof spy>;
  create: ReturnType<typeof spy>;
  update: ReturnType<typeof spy>;
  delete: ReturnType<typeof spy>;
};

function payloadStub(overrides: Partial<PayloadStub> = {}): PayloadStub {
  const base: PayloadStub = {
    find: spy(async () => ({ docs: [], totalDocs: 0 })),
    findByID: spy(),
    create: spy(),
    update: spy(),
    delete: spy(),
  };
  return { ...base, ...overrides } as PayloadStub;
}

function contentOver(payload: PayloadStub) {
  return createAdminPayloadContent({
    payload,
    resolveUser: async () => ({ id: "u1", email: "ada@example.com" }),
  });
}

describe("the payload store", () => {
  it("answers a paged query with the rows and the count the same query matched", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "a" }], totalDocs: 7 })),
    });
    const store = createAdminPayloadPersistenceAdapter({
      content: contentOver(payload),
      collection: (resource) => `payload-${resource}`,
    });

    const page = await store.queryPage!("orders", {
      filter: [{ field: "kind", operator: "eq", value: "page-view" }],
      sort: [{ field: "occurred_at", direction: "asc" }],
      window: { offset: 20, limit: 10 },
    });

    expect(page.rows).toEqual([{ id: "a" }]);
    expect(page.total).toBe(7);
    const args = payload.find.mock.calls[0]![0];
    expect(args.collection).toBe("payload-orders");
    expect(args.where).toEqual({ kind: { equals: "page-view" } });
    expect(args.sort).toBe("occurred_at");
    expect(args.limit).toBe(10);
    expect(args.page).toBe(3);
  });

  it("carries the access check and the session on every call, because the content does", async () => {
    const payload = payloadStub();
    const store = createAdminPayloadPersistenceAdapter({
      content: contentOver(payload),
      collection: "orders",
    });

    await store.create("orders", { name: "An order" });
    await store.update("orders", "1", { name: "An order" });
    await store.delete("orders", "1");

    for (const mock of [payload.create, payload.update, payload.delete]) {
      const args = mock.mock.calls[0]![0];
      expect(args.overrideAccess).toBe(false);
      expect(args.user).toEqual({ id: "u1", email: "ada@example.com" });
    }
  });

  it("refuses a window that does not start on a page boundary", async () => {
    const store = createAdminPayloadPersistenceAdapter({
      content: contentOver(payloadStub()),
      collection: "orders",
    });

    await expect(
      store.queryPage!("orders", { window: { offset: 5, limit: 10 } }),
    ).rejects.toThrow(/page boundary/);
  });
});

describe("the payload media adapter", () => {
  it("lists the uploads as the items the library shows", async () => {
    const payload = payloadStub({
      find: spy(async () => ({
        docs: [
          { id: 7, filename: "espresso.png", mimeType: "image/png", filesize: 1024, url: "/media/espresso.png" },
        ],
        totalDocs: 1,
      })),
    });
    const adapter = createAdminPayloadMediaAdapter({ content: contentOver(payload) });

    const result = await adapter.list({ search: "espresso" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: "espresso.png",
      kind: "image",
      publicUrl: "/media/espresso.png",
      size: 1024,
    });
    expect(payload.find.mock.calls[0]![0].where).toEqual({ filename: { like: "%espresso%" } });
  });

  it("uploads, renames and deletes through the call site", async () => {
    const payload = payloadStub();
    const adapter = createAdminPayloadMediaAdapter({ content: contentOver(payload), collection: "media" });

    await adapter.upload(new File(["x"], "photo.png", { type: "image/png" }));
    await adapter.rename!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" }, "renamed.png");
    await adapter.delete!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" });

    expect(payload.create.mock.calls.length).toBe(1);
    expect(payload.update.mock.calls.length).toBe(1);
    expect(payload.delete.mock.calls.length).toBe(1);
    const createArgs = payload.create.mock.calls[0]![0];
    expect(createArgs.collection).toBe("media");
    expect(createArgs.overrideAccess).toBe(false);
  });
});

describe("the payload loaders", () => {
  it("counts the records in a collection", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "a" }], totalDocs: 12 })),
    });
    const load = createAdminPayloadCountLoader({ content: contentOver(payload), collection: "orders" });

    expect(await load()).toBe(12);
  });

  it("reads the trail with the filter as a condition, not in the browser", async () => {
    const payload = payloadStub({
      find: spy(async () => ({
        docs: [{ id: "e1", action: "update", resource: "orders", occurredAt: "2026-10-12T09:00:00.000Z" }],
        totalDocs: 1,
      })),
    });
    const load = createAdminPayloadActivityLoader({ content: contentOver(payload) });

    const events = await load({ action: "update", from: "2026-10-01", to: "2026-10-31" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "update", resource: "orders" });
    expect(payload.find.mock.calls[0]![0].where).toEqual({
      and: [
        { action: { equals: "update" } },
        { occurredAt: { greater_than_equal: "2026-10-01" } },
        { occurredAt: { less_than_equal: "2026-10-31" } },
      ],
    });
  });
});
