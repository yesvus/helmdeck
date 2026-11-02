// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { Users } from "../examples/payload-host/lib/payload/collections";
import { assertNotLastAdmin } from "../examples/payload-host/lib/payload/users-guard";
import { createUserActions } from "../examples/payload-host/lib/users-actions-factory";

describe("users host #416 access", () => {
  const access = Users.access!;
  const invoke = (operation: "create" | "read" | "update" | "delete", user: unknown, id?: string) =>
    (access[operation] as (args: never) => unknown)({ req: { user, payload: undefined }, ...(id ? { id } : {}) } as never);

  it("refuses anonymous and non-admin create/update/delete", async () => {
    for (const user of [null, { id: "e", role: "editor" }]) {
      expect(await invoke("create", user)).toBe(false);
      expect(await invoke("update", user)).toBe(false);
      expect(await invoke("delete", user, "other")).toBe(false);
    }
  });

  it("permits an admin create/update", async () => {
    expect(await invoke("create", { id: "a", role: "admin" })).toBe(true);
    expect(await invoke("update", { id: "a", role: "admin" })).toBe(true);
  });

  it("refuses self-deletion even for an admin", async () => {
    expect(await invoke("delete", { id: "a", role: "admin" }, "a")).toBe(false);
  });

  it("refuses a collection-level (bulk) delete even for an admin", async () => {
    expect(await invoke("delete", { id: "a", role: "admin" })).toBe(false);
  });
});

describe("users host #416 last-admin guard", () => {
  it("refuses demote/delete of the final admin", async () => {
    const result = await assertNotLastAdmin("delete", "admin-2", "admin-1", { countAdmins: async () => 1 });
    expect(result.ok).toBe(false);
  });

  it("permits when two admins exist", async () => {
    const result = await assertNotLastAdmin("delete", "admin-2", "admin-1", { countAdmins: async () => 2 });
    expect(result.ok).toBe(true);
  });

  it("refuses self-deletion", async () => {
    const result = await assertNotLastAdmin("delete", "admin-1", "admin-1", { countAdmins: async () => 2 });
    expect(result.ok).toBe(false);
  });

  it("permits demotion when multiple admins exist", async () => {
    const result = await assertNotLastAdmin("update", "admin-2", "admin-1", { countAdmins: async () => 2, nextRole: "editor" });
    expect(result.ok).toBe(true);
  });
});

describe("users host #416 actions", () => {
  function payload() {
    return {
      find: vi.fn(async () => ({ docs: [{ id: "u1", email: "a@example.com", role: "admin" }] })),
      findByID: vi.fn(async () => ({ id: "u2", email: "b@example.com", role: "admin" })),
      create: vi.fn(async () => ({ id: "u3" })),
      update: vi.fn(async () => ({ id: "u2" })),
      delete: vi.fn(async () => ({})),
      count: vi.fn(async () => ({ totalDocs: 2 })),
    };
  }

  it("enforces admin-only create", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => null, payload: p });
    const result = await actions.createUser({ email: "x@example.com", role: "editor" });
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.create).not.toHaveBeenCalled();
  });

  it("creates a user for an admin", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.createUser({ email: "x@example.com", role: "editor", password: "secret" });
    expect(result).toEqual({ ok: true });
    expect(p.create).toHaveBeenCalled();
  });

  it("enforces admin-only role change", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "e", role: "editor" }), payload: p });
    const result = await actions.changeUserRole("u2", "editor");
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("refuses demoting the last admin", async () => {
    const p = payload();
    p.count = vi.fn(async () => ({ totalDocs: 1 }));
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.changeUserRole("u2", "editor");
    expect(result.ok).toBe(false);
    expect(p.update).not.toHaveBeenCalled();
  });

  it("changes role when multiple admins exist", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.changeUserRole("u2", "editor");
    expect(result).toEqual({ ok: true });
    expect(p.update).toHaveBeenCalled();
  });

  it("enforces admin-only unlock", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => null, payload: p });
    const result = await actions.unlockUser("u2");
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("unlocks for an admin", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.unlockUser("u2");
    expect(result).toEqual({ ok: true });
    expect(p.update).toHaveBeenCalled();
  });

  it("enforces admin-only delete", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "e", role: "editor" }), payload: p });
    const result = await actions.deleteUser("u2");
    expect(result).toEqual({ ok: false, error: "Not authorized" });
    expect(p.delete).not.toHaveBeenCalled();
  });

  it("refuses self-deletion", async () => {
    const p = payload();
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.deleteUser("a");
    expect(result).toEqual({ ok: false, error: "Cannot delete your own account" });
    expect(p.delete).not.toHaveBeenCalled();
  });

  it("refuses deleting the last admin", async () => {
    const p = payload();
    p.count = vi.fn(async () => ({ totalDocs: 1 }));
    p.findByID = vi.fn(async () => ({ id: "u2", email: "b@example.com", role: "admin" }));
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.deleteUser("u2");
    expect(result.ok).toBe(false);
    expect(p.delete).not.toHaveBeenCalled();
  });

  it("deletes a non-admin account", async () => {
    const p = payload();
    p.findByID = vi.fn(async () => ({ id: "u2", email: "b@example.com", role: "editor" }));
    const actions = createUserActions({ sessionResolver: async () => ({ id: "a", role: "admin" }), payload: p });
    const result = await actions.deleteUser("u2");
    expect(result).toEqual({ ok: true });
    expect(p.delete).toHaveBeenCalled();
  });
});
