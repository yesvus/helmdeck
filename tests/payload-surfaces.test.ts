// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createAdminPayloadContent } from "../src/payload/bridge";
import { createAdminPayloadPersistenceAdapter } from "../src/payload/store";
import { createPersistenceCredentialStore } from "../src/baseline/credentials";
import { adminPayloadMediaKind, createAdminPayloadMediaAdapter } from "../src/payload/media";
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
    await store.read("orders", "1");
    await store.delete("orders", "1");

    for (const mock of [payload.create, payload.update, payload.findByID, payload.delete]) {
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

    const photo = new File(["x"], "photo.png", { type: "image/png" });
    await adapter.upload(photo);
    await adapter.rename!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" }, "renamed.png");
    await adapter.delete!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" });

    expect(payload.create.mock.calls.length).toBe(1);
    expect(payload.update.mock.calls.length).toBe(1);
    expect(payload.delete.mock.calls.length).toBe(1);
    const createArgs = payload.create.mock.calls[0]![0];
    expect(createArgs.collection).toBe("media");
    expect(createArgs.overrideAccess).toBe(false);
    expect(createArgs.file).toBe(photo);
    expect((createArgs.file as File).name).toBe("photo.png");
    expect(createArgs.data).toEqual({});
    const renameArgs = payload.update.mock.calls[0]![0];
    expect(renameArgs).toMatchObject({ collection: "media", id: "7", data: { filename: "renamed.png" } });
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

  it("ends the to bound at the day it names, and passes a timestamp bound as it is", async () => {
    const payload = payloadStub();
    const load = createAdminPayloadActivityLoader({ content: contentOver(payload) });

    await load({ to: "2026-10-31" });
    expect(payload.find.mock.calls[0]![0].where).toEqual({
      occurredAt: { less_than_equal: "2026-10-31T23:59:59.999Z" },
    });

    await load({ to: "2026-10-31T12:00:00.000Z" });
    expect(payload.find.mock.calls[1]![0].where).toEqual({
      occurredAt: { less_than_equal: "2026-10-31T12:00:00.000Z" },
    });
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
        { occurredAt: { less_than_equal: "2026-10-31T23:59:59.999Z" } },
      ],
    });
  });
});

describe("the store's read, on what is not there and what failed", () => {
  it("answers null for a record Payload says is not there, and throws on anything else", async () => {
    const payload = payloadStub({
      findByID: spy(async () => {
        throw Object.assign(new Error("The requested resource was not found."), { name: "NotFoundError" });
      }),
    });
    const store = createAdminPayloadPersistenceAdapter({ content: contentOver(payload), collection: "orders" });

    expect(await store.read("orders", "1")).toBe(null);

    payload.findByID = spy(async () => {
      throw Object.assign(new Error("You are not allowed to perform this operation."), { name: "ForbiddenError" });
    });
    await expect(store.read("orders", "1")).rejects.toThrow(/not allowed/);
  });
});

describe("the payload loaders' actor field", () => {
  it("reads the configured field when it maps the event", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "e1", action: "update", occurredAt: "2026-10-12T09:00:00.000Z", editorId: "u9" }], totalDocs: 1 })),
    });
    const load = createAdminPayloadActivityLoader({ content: contentOver(payload), actorField: "editorId" });

    const events = await load({ action: "update" });

    expect(events[0]).toMatchObject({ action: "update", actor: { userId: "u9", email: "u9" } });
  });
});

describe("adminPayloadMediaKind", () => {
  it("names image, video and pdf, and keeps no claim about a type it has no name for", () => {
    const kindOf = (mimeType: string) =>
      adminPayloadMediaKind({ id: "m", mimeType, filename: "f", url: "u" });

    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("application/zip")).toBe("other");
    expect(kindOf("text/plain")).toBe("other");
    expect(kindOf("")).toBe("other");
  });
});

describe("the payload store, on what the other adapters answer", () => {
  it("searches the fields the host named, with the term as Payload's like", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "a" }], totalDocs: 1 })),
    });
    const store = createAdminPayloadPersistenceAdapter({
      content: contentOver(payload),
      collection: "orders",
      searchFields: ["name", "note"],
    });

    await store.queryPage!("orders", { search: "espresso", filter: [{ field: "kind", operator: "eq", value: "order" }] });

    expect(payload.find.mock.calls[0]![0].where).toEqual({
      and: [
        { kind: { equals: "order" } },
        { or: [{ name: { contains: "espresso" } }, { note: { contains: "espresso" } }] },
      ],
    });
  });

  it("refuses a search it has no fields to read, rather than answering it unsearched", async () => {
    const store = createAdminPayloadPersistenceAdapter({
      content: contentOver(payloadStub()),
      collection: "orders",
    });

    await expect(store.queryPage!("orders", { search: "espresso" })).rejects.toThrow(/no fields named to search/);
  });

  it("answers a query with no window with every row, not the list page's cap", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: Array.from({ length: 1001 }, (_, i) => ({ id: String(i) })), totalDocs: 1001 })),
    });
    const store = createAdminPayloadPersistenceAdapter({ content: contentOver(payload), collection: "users" });

    const rows = await store.query!("users");

    expect(rows).toHaveLength(1001);
    const args = payload.find.mock.calls[0]![0];
    expect(args.pagination).toBe(false);
    expect(args.limit).toBeUndefined();
  });

  it("answers the exact-match map the credential store hands over", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "u1", email: "ada@example.com" }], totalDocs: 1 })),
    });
    const store = createAdminPayloadPersistenceAdapter({ content: contentOver(payload), collection: "users" });

    const rows = await store.query!("users", { email: "ada@example.com" });

    expect(rows).toEqual([{ id: "u1", email: "ada@example.com" }]);
    expect(payload.find.mock.calls[0]![0].where).toEqual({ email: { equals: "ada@example.com" } });
  });

  it("finds the credential store's user by email over this store", async () => {
    const payload = payloadStub({
      find: spy(async () => ({ docs: [{ id: "u1", email: "ada@example.com", password_hash: "h" }], totalDocs: 1 })),
    });
    const store = createAdminPayloadPersistenceAdapter({ content: contentOver(payload), collection: "users" });
    const users = createPersistenceCredentialStore(store);

    const user = await users.findUserByEmail("ada@example.com");

    expect(user).toMatchObject({ id: "u1" });
  });
});
