// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createAdminPayloadActivityLoader } from "../src/payload/loaders.js";
import { createAdminPayloadAuditHooks } from "../src/payload/audit-hooks.js";
import { createAdminPayloadContent } from "../src/payload/bridge.js";

describe("audit hooks (427)", () => {
  it("generates a created row on collection create", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: { user: { id: "admin-1" } }, operation: "create" });
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created", resource: "pages", resourceId: "p1", actorId: "admin-1" }),
      expect.anything(),
    );
  });

  it("generates an updated row on collection update", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: { user: { id: "admin-1" } }, operation: "update" });
    expect(writer).toHaveBeenCalledWith(expect.objectContaining({ action: "updated", resourceId: "p1" }), expect.anything());
  });

  it("generates a deleted row on collection delete", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterDelete[0]({ doc: { id: "p1" }, req: { user: { id: "admin-1" } }, id: "p1" });
    expect(writer).toHaveBeenCalledWith(expect.objectContaining({ action: "deleted", resourceId: "p1" }), expect.anything());
  });

  it("does not write a row from afterChange on delete", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: { user: { id: "admin-1" } }, operation: "delete" });
    expect(writer).not.toHaveBeenCalled();
  });

  it("resolves actorId for an admin user", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: { user: { id: 42 } }, operation: "create" });
    expect(writer.mock.calls[0][0].actorId).toBe("42");
  });

  it("sets actorId to null for anonymous", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: {}, operation: "create" });
    expect(writer.mock.calls[0][0].actorId).toBeNull();
  });

  it("handles a global create/update", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "siteSettings", kind: "global", writer });
    await hooks.afterChange[0]({ doc: { id: "s1" }, req: { user: { id: "admin-1" } }, previousDoc: null });
    expect(writer.mock.calls[0][0].action).toBe("created");
    await hooks.afterChange[0]({ doc: { id: "s1" }, req: { user: { id: "admin-1" } }, previousDoc: { id: "s1" } });
    expect(writer.mock.calls[1][0].action).toBe("updated");
  });

  it("writes occurredAt", async () => {
    const writer = vi.fn();
    const hooks = createAdminPayloadAuditHooks({ resource: "pages", writer, now: () => "2026-01-01T00:00:00.000Z" });
    await hooks.afterChange[0]({ doc: { id: "p1" }, req: { user: { id: "a" } }, operation: "create" });
    expect(writer.mock.calls[0][0].occurredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("reads activity through the permission-checked loader", async () => {
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: "e1", action: "created", resource: "pages", occurredAt: "2026-01-01T00:00:00.000Z" }], totalDocs: 1 })),
      findByID: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const content = createAdminPayloadContent({ payload, resolveUser: async () => ({ id: "u1", email: "ada@example.com" }) });
    const load = createAdminPayloadActivityLoader({ content });
    const events = await load({});
    expect(events).toHaveLength(1);
    const args = (payload.find as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { overrideAccess: boolean; user: unknown };
    expect(args.overrideAccess).toBe(false);
    expect(args.user).toEqual({ id: "u1", email: "ada@example.com" });
  });
});
