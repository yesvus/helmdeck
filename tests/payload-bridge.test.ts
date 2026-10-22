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

  it("refuses a call with no session before it reaches payload", async () => {
    const payload = payloadStub();
    const content = createAdminPayloadContent({ payload, resolveUser: async () => null });

    await expect(content.find("pages")).rejects.toBeInstanceOf(AdminPayloadAccessRefused);
    expect(payload.find).not.toHaveBeenCalled();
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

    expect(await adapter.can("products:read", { operation: "read" })).toBe(true);
    expect(rule).toHaveBeenCalledWith({ user: { id: "u1" } });
  });

  it("refuses a request with no session", async () => {
    const rule = vi.fn(async () => true);
    const adapter = createAdminPayloadPermissionsAdapter({
      access: { read: rule },
      resolveUser: async () => null,
    });

    expect(await adapter.can("products:read", { operation: "read" })).toBe(false);
    expect(rule).not.toHaveBeenCalled();
  });
});
