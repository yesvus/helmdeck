// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createAdminSearchAdapter } from "../src/adapters/search.js";

describe("createAdminSearchAdapter", () => {
  it("checks resource and record permissions before returning cross-resource matches", async () => {
    const searchOrders = vi.fn(async () => [
      { id: "4412", label: "Order 4412", href: "/orders/4412" },
      { id: "4413", label: "Order 4413", href: "/orders/4413" },
    ]);
    const searchCustomers = vi.fn(async () => [
      { id: "c-1", label: "Ada Lovelace", href: "/customers/c-1" },
    ]);
    const can = vi.fn(async (_permission: string, context?: { resourceId?: string }) => context?.resourceId !== "4413");
    const adapter = createAdminSearchAdapter({
      permissions: { can },
      resources: [
        { resource: "orders", label: "Orders", search: searchOrders },
        { resource: "customers", label: "Customers", search: searchCustomers },
      ],
    });

    await expect(adapter.search("441", new AbortController().signal)).resolves.toEqual([
      {
        resource: "orders",
        resourceLabel: "Orders",
        resourceId: "4412",
        label: "Order 4412",
        href: "/orders/4412",
      },
      {
        resource: "customers",
        resourceLabel: "Customers",
        resourceId: "c-1",
        label: "Ada Lovelace",
        href: "/customers/c-1",
      },
    ]);
    expect(searchOrders).toHaveBeenCalledWith("441", expect.any(AbortSignal), 50);
    expect(can.mock.invocationCallOrder[0]).toBeLessThan(searchOrders.mock.invocationCallOrder[0]);
    expect(can.mock.invocationCallOrder[1]).toBeLessThan(searchOrders.mock.invocationCallOrder[0]);
    expect(searchCustomers).toHaveBeenCalledWith("441", expect.any(AbortSignal), 50);
    expect(can).toHaveBeenCalledWith("orders.read");
    expect(can).toHaveBeenCalledWith("orders.read", { resourceId: "4412" });
    expect(can).toHaveBeenCalledWith("orders.read", { resourceId: "4413" });
    expect(can).toHaveBeenCalledWith("customers.read");
    expect(can).toHaveBeenCalledWith("customers.read", { resourceId: "c-1" });
  });

  it("does not query anything for blank input", async () => {
    const search = vi.fn();
    const adapter = createAdminSearchAdapter({
      permissions: { can: vi.fn(async () => true) },
      resources: [{ resource: "orders", label: "Orders", search }],
    });

    await expect(adapter.search("  ", new AbortController().signal)).resolves.toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("stops before querying a resource the session cannot read", async () => {
    const search = vi.fn();
    const adapter = createAdminSearchAdapter({
      permissions: { can: vi.fn(async () => false) },
      resources: [{ resource: "orders", label: "Orders", search }],
    });

    await expect(adapter.search("441", new AbortController().signal)).resolves.toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("does not query resources whose specific read permission is denied", async () => {
    const searchOrders = vi.fn(async () => []);
    const searchCustomers = vi.fn(async () => []);
    const adapter = createAdminSearchAdapter({
      permissions: { can: vi.fn(async (permission: string) => permission !== "customers.read") },
      resources: [
        { resource: "orders", label: "Orders", search: searchOrders },
        { resource: "customers", label: "Customers", search: searchCustomers },
      ],
    });

    await expect(adapter.search("Ada", new AbortController().signal)).resolves.toEqual([]);
    expect(searchOrders).toHaveBeenCalledOnce();
    expect(searchCustomers).not.toHaveBeenCalled();
  });

  it("keeps successful resource results when another resource search fails", async () => {
    const adapter = createAdminSearchAdapter({
      permissions: { can: vi.fn(async () => true) },
      resources: [
        { resource: "orders", label: "Orders", search: vi.fn().mockRejectedValue(new Error("Unavailable")) },
        { resource: "customers", label: "Customers", search: vi.fn(async () => [
          { id: "c-1", label: "Ada Lovelace", href: "/customers/c-1" },
        ]) },
      ],
    });

    await expect(adapter.search("Ada", new AbortController().signal)).resolves.toMatchObject([
      { resource: "customers", resourceId: "c-1", label: "Ada Lovelace" },
    ]);
  });

  it("uses the resource's configured read permission and requested result limit", async () => {
    const search = vi.fn(async () =>
      Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `Order ${index}`, href: `/orders/${index}` })),
    );
    const can = vi.fn(async () => true);
    const adapter = createAdminSearchAdapter({
      permissions: { can },
      resources: [{ resource: "orders", label: "Orders", permission: "orders.view", maxResults: 3, search }],
    });

    await expect(adapter.search("Order", new AbortController().signal)).resolves.toHaveLength(3);
    expect(search).toHaveBeenCalledWith("Order", expect.any(AbortSignal), 15);
    expect(can).toHaveBeenCalledWith("orders.view");
    expect(can).toHaveBeenCalledTimes(13);
  });

  it("treats rejected resource-level permission checks as denials", async () => {
    const searchOrders = vi.fn(async () => [{ id: "1", label: "Order 1", href: "/orders/1" }]);
    const searchCustomers = vi.fn(async () => [{ id: "c-1", label: "Ada Lovelace", href: "/customers/c-1" }]);
    const adapter = createAdminSearchAdapter({
      permissions: {
        can: vi.fn(async (permission: string, context?: { resourceId?: string }) => {
          if (!context && permission === "orders.read") throw new Error("Permission service unavailable");
          return true;
        }),
      },
      resources: [
        { resource: "orders", label: "Orders", search: searchOrders },
        { resource: "customers", label: "Customers", search: searchCustomers },
      ],
    });

    await expect(adapter.search("Ada", new AbortController().signal)).resolves.toMatchObject([
      { resource: "customers", resourceId: "c-1", label: "Ada Lovelace" },
    ]);
    expect(searchOrders).not.toHaveBeenCalled();
    expect(searchCustomers).toHaveBeenCalledOnce();
  });

  it("fails closed on rejected permission checks and applies the result limit after filtering", async () => {
    const can = vi.fn(async (_permission: string, context?: { resourceId?: string }) => {
      if (context?.resourceId === "1") throw new Error("Permission service unavailable");
      return context?.resourceId !== "2";
    });
    const adapter = createAdminSearchAdapter({
      permissions: { can },
      resources: [{
        resource: "orders",
        label: "Orders",
        maxResults: 2,
        search: async () => Array.from({ length: 4 }, (_, index) => ({
          id: String(index + 1),
          label: `Order ${index + 1}`,
          href: `/orders/${index + 1}`,
        })),
      }],
    });

    await expect(adapter.search("Order", new AbortController().signal)).resolves.toMatchObject([
      { resourceId: "3", label: "Order 3" },
      { resourceId: "4", label: "Order 4" },
    ]);
  });

  it("limits concurrent record permission checks and stops filtering promptly on abort", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      label: `Order ${index}`,
      href: `/orders/${index}`,
    }));
    const can = vi.fn(async (_permission: string, context?: { resourceId?: string }) => {
      if (!context) return true;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return true;
    });
    const adapter = createAdminSearchAdapter({
      permissions: { can },
      resources: [{ resource: "orders", label: "Orders", search: async () => candidates }],
    });

    await adapter.search("Order", new AbortController().signal);
    expect(maxInFlight).toBeLessThanOrEqual(8);

    let resolvePermission!: (value: boolean) => void;
    let startRecordCheck!: () => void;
    const recordCheckStarted = new Promise<void>((resolve) => { startRecordCheck = resolve; });
    const pendingPermission = new Promise<boolean>((resolve) => { resolvePermission = resolve; });
    const controller = new AbortController();
    const cancellableAdapter = createAdminSearchAdapter({
      permissions: { can: vi.fn((_permission: string, context?: { resourceId?: string }) =>
        context ? (startRecordCheck(), pendingPermission) : Promise.resolve(true),
      ) },
      resources: [{ resource: "orders", label: "Orders", search: async () => candidates.slice(0, 1) }],
    });
    const search = cancellableAdapter.search("Order", controller.signal);
    await recordCheckStarted;
    controller.abort(new Error("Search cancelled"));
    await expect(search).rejects.toThrow("Search cancelled");
    resolvePermission(true);
  });
});
