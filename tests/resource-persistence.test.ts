// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import {
  createAdminResourceActionPersistenceAdapter,
  createReadOnlyPersistenceAdapter,
} from "../src/resources/persistence";
import type { AdminResourceQuery } from "../src/adapters/query";

describe("createReadOnlyPersistenceAdapter", () => {
  it("forwards reads and refuses every write with its operation and resource", async () => {
    const query = vi.fn(async (_resource: string, _query?: Record<string, unknown>) => [
      { id: "r1", title: "Quarterly report" },
    ]);
    const read = vi.fn(async (_resource: string, _id: string) => ({ id: "r1", title: "Quarterly report" }));
    const adapter = createReadOnlyPersistenceAdapter({ query, read });

    await expect(adapter.query("reports")).resolves.toEqual([{ id: "r1", title: "Quarterly report" }]);
    await expect(adapter.read("reports", "r1")).resolves.toEqual({ id: "r1", title: "Quarterly report" });
    expect(adapter.queryPage).toBeUndefined();
    expect(query).toHaveBeenCalledWith("reports", undefined);
    expect(read).toHaveBeenCalledWith("reports", "r1");

    await expect(adapter.create("reports", {})).rejects.toThrow(/create.*reports/i);
    await expect(adapter.update("reports", "r1", {})).rejects.toThrow(/update.*reports/i);
    await expect(adapter.delete("reports", "r1")).rejects.toThrow(/delete.*reports/i);
  });

  it("keeps paging absent unless the source implements it", async () => {
    const queryPage = vi.fn(async (_resource: string, _query?: AdminResourceQuery) => ({
      rows: [{ id: "r1" }],
      total: 6,
    }));
    const adapter = createReadOnlyPersistenceAdapter({
      query: async () => [],
      read: async () => null,
      queryPage,
    });

    await expect(adapter.queryPage?.("reports", { window: { offset: 0, limit: 1 } })).resolves.toEqual({
      rows: [{ id: "r1" }],
      total: 6,
    });
    expect(queryPage).toHaveBeenCalledWith("reports", { window: { offset: 0, limit: 1 } });
  });
});

describe("createAdminResourceActionPersistenceAdapter", () => {
  it("forwards the host action calls and preserves optional paging", async () => {
    const query = vi.fn(async (_resource: string, _query?: Record<string, unknown>) => [{ id: "r1" }]);
    const read = vi.fn(async (_resource: string, _id: string) => ({ id: "r1" }));
    const create = vi.fn(async (resource: string, value: unknown) => ({ resource, id: "r2", value }));
    const update = vi.fn(async (resource: string, id: string, value: unknown) => ({ resource, id, value }));
    const remove = vi.fn(async (_resource: string, _id: string) => {});
    const base = createAdminResourceActionPersistenceAdapter({ query, read, create, update, delete: remove });
    const queryPage = vi.fn(async (_resource: string, _query?: AdminResourceQuery) => ({
      rows: [{ id: "r1" }],
      total: 6,
    }));
    const paged = createAdminResourceActionPersistenceAdapter({
      query,
      read,
      create,
      update,
      delete: remove,
      queryPage,
    });

    expect(base.queryPage).toBeUndefined();
    await expect(base.query("reports")).resolves.toEqual([{ id: "r1" }]);
    expect(query).toHaveBeenCalledWith("reports", undefined);
    await expect(base.read("reports", "r1")).resolves.toEqual({ id: "r1" });
    expect(read).toHaveBeenCalledWith("reports", "r1");
    await expect(base.create("reports", { title: "New" })).resolves.toEqual({
      resource: "reports",
      id: "r2",
      value: { title: "New" },
    });
    expect(create).toHaveBeenCalledWith("reports", { title: "New" });
    await expect(base.update("reports", "r1", { title: "Updated" })).resolves.toEqual({
      resource: "reports",
      id: "r1",
      value: { title: "Updated" },
    });
    expect(update).toHaveBeenCalledWith("reports", "r1", { title: "Updated" });
    await expect(base.delete("reports", "r1")).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith("reports", "r1");
    await expect(paged.queryPage?.("reports", { window: { offset: 0, limit: 1 } })).resolves.toEqual({
      rows: [{ id: "r1" }],
      total: 6,
    });
    expect(queryPage).toHaveBeenCalledWith("reports", { window: { offset: 0, limit: 1 } });
  });
});
