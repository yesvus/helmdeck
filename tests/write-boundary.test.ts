// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline";
import {
  AdminResourceFieldError,
  createAdminResourceActions,
  defineAdminResource,
  type AdminPersistenceAdapter,
  type AdminResourceDefinition,
} from "../src/index";

/**
 * What a write is allowed to carry, through the package's own seam.
 *
 * This suite exists because the boundary was open here for the whole life of the package. The demo
 * and the starter template each filtered every write through `adminResourceValues` in their own
 * adapter, so `tests/demo-write-shape.test.ts` was asserting a fixture's copy while the seam every
 * other host reaches did not enforce anything about columns at all. A definition declaring `name` and
 * `sku` stored whatever the adapter accepted, `role` and `is_privileged` included.
 *
 * So every claim here goes through `createAdminResourceActions`, and every assertion reads back what
 * the store holds rather than what the call returned.
 */

const SESSION = { email: "owner@example.test", role: "admin" };

const products: AdminResourceDefinition = defineAdminResource({
  resource: "products",
  label: "Products",
  columns: [
    { key: "name", header: "Name" },
    { key: "sku", header: "SKU" },
  ],
  fields: [
    { name: "name", label: "Name", type: "text" },
    { name: "sku", label: "SKU", type: "text" },
  ],
});

/** A store that notes every call, so a test can assert on what reached it and in what order. */
function host(definitions: readonly AdminResourceDefinition[] = [products]) {
  const base = createMemoryPersistenceAdapter();
  const reached: string[] = [];
  const persistence: AdminPersistenceAdapter = {
    create: async (resource, value) => {
      reached.push(`create:${resource}:${JSON.stringify(value)}`);
      return base.create(resource, value);
    },
    update: async (resource, id, value) => {
      reached.push(`update:${resource}:${JSON.stringify(value)}`);
      return base.update(resource, id, value);
    },
    read: (resource, id) => base.read(resource, id),
    delete: (resource, id) => base.delete(resource, id),
  };
  const actions = createAdminResourceActions({
    guard: async () => SESSION,
    persistence,
    definitions,
  });
  return { actions, persistence, reached };
}

describe("a write carrying a column the definition does not declare", () => {
  it("refuses a privilege column on a create, which is the defect this closes", async () => {
    const { actions, reached } = host();

    await expect(
      actions.create("products", { name: "Widget", sku: "W-1", role: "admin", is_privileged: true }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);

    // Nothing reached the store. A refusal that stored first and complained afterwards would leave the
    // column written, which is the bug with a message attached.
    expect(reached).toEqual([]);
  });

  it("names every offending column, in a stable order, and nothing else", async () => {
    const { actions } = host();

    const refused = await actions
      .create("products", { is_privileged: true, name: "Widget", role: "admin" })
      .then(
        () => null,
        (error: unknown) => error as AdminResourceFieldError,
      );

    expect(refused).toBeInstanceOf(AdminResourceFieldError);
    expect(refused?.fields).toEqual(["is_privileged", "role"]);
    // The declared keys are not named, so a host reading this learns what to add rather than what to remove.
    expect(refused?.message).not.toContain("name");
    expect(refused?.resource).toBe("products");
    expect(refused?.operation).toBe("create");
  });

  it("refuses the same way through an update", async () => {
    const { actions, reached } = host();
    const made = await actions.create<{ id: string }>("products", { name: "Widget", sku: "W-1" });
    reached.length = 0;

    await expect(
      actions.update("products", made.id, { name: "Renamed", is_privileged: true }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);

    expect(reached).toEqual([]);
  });

  it("lets a declared column through, so the boundary is not simply closed", async () => {
    const { actions } = host();

    const made = await actions.create<Record<string, unknown>>("products", { name: "Widget", sku: "W-1" });

    expect(made.name).toBe("Widget");
    expect(made.sku).toBe("W-1");
  });

  it("says where to declare a column the host really does store", async () => {
    const { actions } = host();

    await expect(actions.create("products", { created_at: "1999-01-01" })).rejects.toThrow(
      /add it to the definition's `writable`/,
    );
  });
});

describe("the record's own key", () => {
  it("may be named on a create, because a host may generate record keys in the browser", async () => {
    const { actions } = host();

    const made = await actions.create<{ id: string }>("products", {
      id: "prd_client_generated",
      name: "Widget",
      sku: "W-1",
    });

    expect(made.id).toBe("prd_client_generated");
  });

  it("is refused on an update, where the route already named the record", async () => {
    const { actions } = host();
    const made = await actions.create<{ id: string }>("products", { name: "Widget", sku: "W-1" });

    // Moving a row to an id the route did not choose is not an update of that row, and a store that
    // lets a value's own key win would write it wherever the caller said.
    await expect(
      actions.update("products", made.id, { name: "Renamed", id: "somewhere-else" }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);
  });
});

describe("a definition declaring more than its list shows", () => {
  it("accepts a column the host declared writable and the list does not show", async () => {
    const withTimestamps = defineAdminResource({
      resource: "products",
      label: "Products",
      columns: [{ key: "name", header: "Name" }],
      fields: [{ name: "name", label: "Name", type: "text" }],
      writable: ["updated_at"],
    });
    const { actions } = host([withTimestamps]);

    const made = await actions.create<Record<string, unknown>>("products", {
      name: "Widget",
      updated_at: "2026-09-30T10:00:00.000Z",
    });

    expect(made.updated_at).toBe("2026-09-30T10:00:00.000Z");
  });

  it("still refuses a key the writable list does not name", async () => {
    const withTimestamps = defineAdminResource({
      resource: "products",
      label: "Products",
      columns: [{ key: "name", header: "Name" }],
      fields: [{ name: "name", label: "Name", type: "text" }],
      writable: ["updated_at"],
    });
    const { actions } = host([withTimestamps]);

    await expect(
      actions.create("products", { name: "Widget", role: "admin" }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);
  });
});

describe("a resource no definition names", () => {
  it("is not checked, because the host told this seam nothing about its shape", async () => {
    // A single settings row written by a site's own module is exactly this case, and refusing it would
    // refuse a resource that was never a table.
    const { actions } = host([products]);

    const made = await actions.create<Record<string, unknown>>("site_settings", { theme: "dark" });

    expect(made.theme).toBe("dark");
  });

  it("is refused when the definition says it stores nothing", async () => {
    // Not the same case: a definition with no columns is a host that has said what it stores, and what
    // it stores is nothing.
    const empty = defineAdminResource({
      resource: "hollow",
      label: "Hollow",
      columns: [],
      fields: [],
    });
    const { actions } = host([empty]);

    await expect(actions.create("hollow", { anything: true })).rejects.toBeInstanceOf(
      AdminResourceFieldError,
    );
  });
});

describe("the order the refusals are decided in", () => {
  it("settles every permission before any validation, so one cannot be told from another", async () => {
    // The field refusal is a validation answer and the reference check carries a second permission
    // decision. If validation ran first, a caller could learn which keys a definition declares by
    // sending an undeclared one alongside a forbidden reference and reading which refusal came back.
    const withReference = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      columns: [
        { key: "tracking", header: "Tracking" },
        { key: "order_id", header: "Order", reference: { resource: "orders" } },
      ],
      fields: [
        { name: "tracking", label: "Tracking", type: "text" },
        { name: "order_id", label: "Order", type: "text" },
      ],
    });
    const base = createMemoryPersistenceAdapter();
    const actions = createAdminResourceActions({
      guard: async (_resource, operation) => {
        if (operation === "read") throw new Error("denied: orders.read");
        return SESSION;
      },
      persistence: base,
      definitions: [withReference],
    });

    const refused = await actions
      .create("shipments", { tracking: "T-1", order_id: "ord_1", role: "admin" })
      .then(
        () => null,
        (error: unknown) => error as Error,
      );

    // The permission answer, not the field answer. A caller must not be able to ask which columns a
    // definition declares by watching which refusal it gets.
    expect(refused?.message).toMatch(/orders\.read/);
    expect(refused).not.toBeInstanceOf(AdminResourceFieldError);
  });

  it("still refuses the undeclared key once the permissions have allowed it", async () => {
    const withReference = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      columns: [
        { key: "tracking", header: "Tracking" },
        { key: "order_id", header: "Order", reference: { resource: "orders" } },
      ],
      fields: [
        { name: "tracking", label: "Tracking", type: "text" },
        { name: "order_id", label: "Order", type: "text" },
      ],
    });
    const base = createMemoryPersistenceAdapter();
    const actions = createAdminResourceActions({
      guard: async () => SESSION,
      persistence: base,
      definitions: [withReference],
    });

    await expect(
      actions.create("shipments", { tracking: "T-1", order_id: "ord_1", role: "admin" }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);
  });
});

describe("what a refused write left behind", () => {
  it("leaves the record as it was", async () => {
    const { actions, persistence } = host();
    const made = await actions.create<{ id: string }>("products", { name: "Widget", sku: "W-1" });

    await expect(
      actions.update("products", made.id, { name: "Renamed", is_privileged: true }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);

    const stored = (await persistence.read("products", made.id)) as Record<string, unknown>;
    expect(stored.name).toBe("Widget");
    expect(stored.is_privileged).toBeUndefined();
  });

  it("leaves no record behind on a refused create", async () => {
    const { actions, persistence } = host();

    await expect(
      actions.create("products", { name: "Widget", role: "admin" }),
    ).rejects.toBeInstanceOf(AdminResourceFieldError);

    const page = await persistence.query("products");
    expect(page.rows).toHaveLength(0);
  });
});