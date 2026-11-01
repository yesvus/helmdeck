// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { AdminPayloadAccessRefused, createAdminPayloadContent } from "../src/payload/bridge";
import { createAdminPayloadMediaAdapter } from "../src/payload/media";

type PayloadArgs = { collection: string; [key: string]: unknown };

function makeSpy(answer: (args: PayloadArgs) => Promise<unknown> = async () => ({ id: "1" })) {
  const calls: PayloadArgs[] = [];
  const fn = async (args: PayloadArgs) => {
    calls.push(args);
    return answer(args);
  };
  (fn as unknown as { mock: { calls: PayloadArgs[][] } }).mock = { calls: calls.map((c) => [c]) };
  // expose array directly for convenience
  (fn as unknown as { calls: PayloadArgs[] }).calls = calls;
  return fn as unknown as ((args: PayloadArgs) => Promise<unknown>) & { calls: PayloadArgs[] };
}

function payloadStub(overrides: Partial<Record<string, (args: PayloadArgs) => Promise<unknown>>> = {}) {
  const base = {
    find: makeSpy(async () => ({ docs: [], totalDocs: 0 })),
    findByID: makeSpy(async () => ({ id: "1" })),
    create: makeSpy(async () => ({ id: "7", filename: "photo.png", mimeType: "image/png", filesize: 3, url: "/media/photo.png" })),
    update: makeSpy(async () => ({ id: "7", filename: "renamed.png", mimeType: "image/png", filesize: 3, url: "/media/photo.png" })),
    delete: makeSpy(async () => ({ id: "7" })),
  };
  for (const [key, value] of Object.entries(overrides)) {
    (base as Record<string, unknown>)[key] = makeSpy(value);
  }
  return base;
}

function contentOver(payload: ReturnType<typeof payloadStub>, resolveUser: () => Promise<{ id: string } | null> = async () => ({ id: "u1" })) {
  return createAdminPayloadContent({ payload: payload as never, resolveUser });
}

describe("payload media adapter unauthorized operations", () => {
  it("refuses list, upload, rename and delete with no session before reaching payload", async () => {
    const payload = payloadStub();
    const content = contentOver(payload, async () => null);
    const adapter = createAdminPayloadMediaAdapter({ content, collection: "media" });

    await expect(adapter.list()).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(adapter.upload(new File(["x"], "photo.png", { type: "image/png" }))).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(adapter.rename!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" }, "renamed.png")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(adapter.delete!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" })).rejects.toBeInstanceOf(AdminPayloadAccessRefused);

    expect(payload.find.calls).toHaveLength(0);
    expect(payload.create.calls).toHaveLength(0);
    expect(payload.update.calls).toHaveLength(0);
    expect(payload.delete.calls).toHaveLength(0);
  });
});

describe("payload media adapter", () => {
  it("carries the access check and session on every operation", async () => {
    const payload = payloadStub();
    const content = contentOver(payload);
    const adapter = createAdminPayloadMediaAdapter({ content, collection: "media" });

    await adapter.list();
    await adapter.upload(new File(["x"], "photo.png", { type: "image/png" }));
    await adapter.rename!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" }, "renamed.png");
    await adapter.delete!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" });

    for (const mock of [payload.find, payload.create, payload.update, payload.delete]) {
      const args = mock.calls[0]!;
      expect(args.overrideAccess).toBe(false);
      expect(args.user).toEqual({ id: "u1" });
    }
  });

  it("propagates adapter failures", async () => {
    const payload = payloadStub({
      find: async () => { throw new Error("find failed"); },
      create: async () => { throw new Error("create failed"); },
      update: async () => { throw new Error("update failed"); },
      delete: async () => { throw new Error("delete failed"); },
    });
    const content = contentOver(payload);
    const adapter = createAdminPayloadMediaAdapter({ content, collection: "media" });

    await expect(adapter.list()).rejects.toThrow(/find failed/);
    await expect(adapter.upload(new File(["x"], "photo.png", { type: "image/png" }))).rejects.toThrow(/create failed/);
    await expect(adapter.rename!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" }, "renamed.png")).rejects.toThrow(/update failed/);
    await expect(adapter.delete!({ name: "photo.png", path: "7", publicUrl: "", source: "uploaded", kind: "image" })).rejects.toThrow(/delete failed/);
  });

  it("uploads through the configured collection with the file as Payload's file option", async () => {
    const payload = payloadStub();
    const content = contentOver(payload);
    const adapter = createAdminPayloadMediaAdapter({ content, collection: "media" });

    const file = new File(["x"], "photo.png", { type: "image/png" });
    await adapter.upload(file);

    const createArgs = payload.create.calls[0]!;
    expect(createArgs.collection).toBe("media");
    expect(createArgs.data).toEqual({});
    expect(createArgs.file).toBe(file);
  });
});
