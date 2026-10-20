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
    const can = vi.fn(async (permission: string, context?: { resourceId?: string }) =>
      permission === "orders.read" && context?.resourceId !== "4413",
    );
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
    ]);
    expect(searchOrders).toHaveBeenCalledWith("441", expect.any(AbortSignal));
    expect(can.mock.invocationCallOrder[0]).toBeLessThan(searchOrders.mock.invocationCallOrder[0]);
    expect(can.mock.invocationCallOrder[1]).toBeLessThan(searchOrders.mock.invocationCallOrder[0]);
    expect(searchCustomers).not.toHaveBeenCalled();
    expect(can).toHaveBeenCalledWith("orders.read");
    expect(can).toHaveBeenCalledWith("orders.read", { resourceId: "4412" });
    expect(can).toHaveBeenCalledWith("orders.read", { resourceId: "4413" });
    expect(can).toHaveBeenCalledWith("customers.read");
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
});
