// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  AdminPayloadAccessRefused,
  createAdminPayloadAuthStrategy,
  createAdminPayloadContent,
  createAdminPayloadPermissionsAdapter,
} from "../src/payload/bridge";
import { createAdminPayloadPreset } from "../src/payload/preset";

type PayloadArgs = { collection: string; [key: string]: unknown };

function payloadStub() {
  return {
    find: vi.fn(async (...args: [PayloadArgs]) => { void args; return { docs: [] }; }),
    findByID: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    create: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    update: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    delete: vi.fn(async (...args: [PayloadArgs]) => { void args; return { id: "1" }; }),
    findGlobal: vi.fn(async (...args: [Record<string, unknown>]) => { void args; return {}; }),
    updateGlobal: vi.fn(async (...args: [Record<string, unknown>]) => { void args; return {}; }),
    findVersions: vi.fn(async (...args: [Record<string, unknown>]) => { void args; return {}; }),
    findVersionByID: vi.fn(async (...args: [Record<string, unknown>]) => { void args; return {}; }),
    restoreVersion: vi.fn(async (...args: [Record<string, unknown>]) => { void args; return {}; }),
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

describe("payload globals and versions bridge", () => {
  it("passes the resolved user and disables access override on every operation", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({ payload, resolveUser: async () => ({ id: "u1" }) });
    await content.findGlobal("settings");
    await content.updateGlobal("settings", { title: "Hi" });
    await content.findVersions("pages");
    await content.findVersionByID("pages", "v1");
    await content.restoreVersion("pages", "v1");
    for (const method of [payload.findGlobal, payload.updateGlobal, payload.findVersions, payload.findVersionByID, payload.restoreVersion]) {
      expect(method.mock.calls[0]![0].overrideAccess).toBe(false);
      expect(method.mock.calls[0]![0].user).toEqual({ id: "u1" });
    }
  });

  it("refuses global and version calls without a user", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({ payload, resolveUser: async () => null });
    await expect(content.findGlobal("settings")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.updateGlobal("settings", {})).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.findVersions("pages")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.findVersionByID("pages", "v1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    await expect(content.restoreVersion("pages", "v1")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    for (const method of [payload.findGlobal, payload.updateGlobal, payload.findVersions, payload.findVersionByID, payload.restoreVersion]) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});

it("wires the Payload auth, theme, and page publish task preset", async () => {
  const user = { id: "u1" };
  const preset = createAdminPayloadPreset({ readSession: async () => user, theme: { logo: "./logo" } });
  expect((await preset.authStrategy.authenticate()).user).toEqual(user);
  expect(preset.theme.components).toEqual({ graphics: { Logo: "./logo" } });
  expect(typeof preset.pagePublishTask).toBe("function");
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
