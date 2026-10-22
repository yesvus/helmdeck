// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  AdminPayloadAccessRefused,
  createAdminPayloadAuthStrategy,
  createAdminPayloadContent,
  createAdminPayloadPermissionsAdapter,
} from "../src/payload/bridge";

type PayloadArgs = { collection: string; [key: string]: unknown };

function payloadStub() {
  return {
    find: vi.fn(async (...args: [PayloadArgs]) => { void args; return { docs: [] }; }),
    findByID: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    create: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    update: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    delete: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
  };
}

describe("the payload content bridge", () => {
  it("passes the user and overrideAccess: false on every call", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({
      payload,
      resolveUser: async () => ({ id: "u1", email: "ada@example.com" }),
    });

    await content.find("pages", { limit: 10 });
    await content.findByID("pages", "1");
    await content.create("pages", { title: "A page" });
    await content.update("pages", "1", { title: "A page" });
    await content.delete("pages", "1");

    for (const [args] of [
      payload.find.mock.calls[0],
      payload.findByID.mock.calls[0],
      payload.create.mock.calls[0],
      payload.update.mock.calls[0],
      payload.delete.mock.calls[0],
    ]) {
      expect(args.overrideAccess).toBe(false);
      expect(args.user).toEqual({ id: "u1", email: "ada@example.com" });
    }
  });

  it("does not let the caller's arguments overwrite the collection or the guarded keys", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({
      payload,
      resolveUser: async () => ({ id: "u1" }),
    });

    await content.find("pages", { collection: "other", overrideAccess: true, user: { id: "other" } });
    await content.findByID("pages", "1", { collection: "other", id: "other", overrideAccess: true, user: { id: "other" } });
    await content.create("pages", { title: "A page" }, { collection: "other", data: { title: "Other" }, overrideAccess: true, user: { id: "other" } });
    await content.update("pages", "1", { title: "A page" }, { collection: "other", id: "other", data: { title: "Other" }, overrideAccess: true, user: { id: "other" } });
    await content.delete("pages", "1", { collection: "other", id: "other", overrideAccess: true, user: { id: "other" } });

    const [findArgs] = payload.find.mock.calls[0]!;
    const [findByIdArgs] = payload.findByID.mock.calls[0]!;
    const [createArgs] = payload.create.mock.calls[0]!;
    const [updateArgs] = payload.update.mock.calls[0]!;
    const [deleteArgs] = payload.delete.mock.calls[0]!;

    expect(findArgs.collection).toBe("pages");
    expect(findByIdArgs.collection).toBe("pages");
    expect(findByIdArgs.id).toBe("1");
    expect(createArgs.collection).toBe("pages");
    expect(createArgs.data).toEqual({ title: "A page" });
    expect(updateArgs.id).toBe("1");
    expect(updateArgs.data).toEqual({ title: "A page" });
    expect(deleteArgs.id).toBe("1");
    for (const args of [findArgs, findByIdArgs, createArgs, updateArgs, deleteArgs]) {
      expect(args.overrideAccess).toBe(false);
      expect(args.user).toEqual({ id: "u1" });
    }
  });

  it("refuses a call with no session before it reaches payload", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({ payload, resolveUser: async () => null });

    await expect(content.find("pages")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.findByID("pages", "1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.create("pages", {})).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.update("pages", "1", {})).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.delete("pages", "1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);

    expect(payload.find).not.toHaveBeenCalled();
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
  });
});

describe("the payload auth strategy", () => {
  it("gives payload the session's user and nothing when there is no session", async () => {
    const strategy = createAdminPayloadAuthStrategy({
      readSession: async () => ({ id: "u1", email: "ada@example.com" }),
    });
    expect((await strategy.authenticate(undefined)).user).toEqual({ id: "u1", email: "ada@example.com" });

    const anonymous = createAdminPayloadAuthStrategy({ readSession: async () => null });
    expect((await anonymous.authenticate(undefined)).user).toBeNull();
  });
});

describe("the payload permissions adapter", () => {
  it("asks payload's access function and answers with what it says", async () => {
    const rule = vi.fn(async () => true);
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read: rule },
      resolveUser: async () => ({ id: "u1" }),
    });

    expect(await adapter.can("products:read")).toBe(true);
    expect(rule).toHaveBeenCalledWith({ user: { id: "u1" } });
  });

  it("asks the rule of the operation the permission names", async () => {
    const read = vi.fn(async () => true);
    const create = vi.fn(async () => true);
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read, create },
      resolveUser: async () => ({ id: "u1" }),
    });

    expect(await adapter.can("products:create")).toBe(true);
    expect(create).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("does not read a filter as an approval", async () => {
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read: async () => ({ id: { equals: "1" } }) as unknown as boolean },
      resolveUser: async () => ({ id: "u1" }),
    });

    expect(await adapter.can("products:read")).toBe(false);
  });

  it("refuses a permission that names no operation", async () => {
    const rule = vi.fn(async () => true);
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read: rule },
      resolveUser: async () => ({ id: "u1" }),
    });

    expect(await adapter.can("products")).toBe(false);
    expect(rule).not.toHaveBeenCalled();
  });

  it("refuses a request with no session", async () => {
    const rule = vi.fn(async () => true);
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read: rule },
      resolveUser: async () => null,
    });

    expect(await adapter.can("products:read")).toBe(false);
    expect(rule).not.toHaveBeenCalled();
  });
});
