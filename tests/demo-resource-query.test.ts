// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminResourceNotExposedError } from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import { productsResource } from "../fixtures/lib/admin-resources";
import { clientPersistence, pagedClientPersistence } from "../fixtures/lib/client-persistence";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { queryPageAction } from "../fixtures/lib/resource-actions";
import { seedProducts } from "../fixtures/lib/seed-data";

/**
 * The demo's half of the paged query, asked through the seam the products page uses.
 *
 * The list draws a search box, sortable headers, a filter and a pager because the adapter it was
 * handed has a paged call, and it sends every one of them to the store rather than narrowing the
 * rows it was given. None of that is visible from the package's own tests, which mount the list on
 * an adapter a test built: what is checked here is that the demo actually supplies one, that the
 * server action behind it reaches the demo's store, and that a list on a store without it draws
 * nothing rather than drawing controls that cannot work.
 */
const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Product = { id: string; name: string; sku: string; price_cents: number; stock: number };

const owner = demoAccounts.find((account) => account.role === "admin")!;

beforeEach(async () => {
  // The session store refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. This is the server half of the seam, so it runs without one.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");
  expect(result.ok, "the owner could not sign in").toBe(true);
});

describe("the paged query the demo's browser asks for", () => {
  it("answers with the store's rows and the count of what matched, not of the page", async () => {
    const page = await queryPageAction("products", {
      search: "lamp",
      sort: [{ field: "price_cents", direction: "asc" }],
      window: { offset: 0, limit: 1 },
    });

    // The seeded products hold two lamps, so a count taken from the page would say 1 here and the
    // pager would offer a second page of a list that has two rows in it.
    expect(page.total).toBe(2);
    expect(page.rows).toHaveLength(1);
    expect((page.rows[0] as Product).name).toBe("Amber desk lamp");
  });

  it("orders by what it was asked for, in the direction it was asked for", async () => {
    const byPrice = await queryPageAction("products", {
      sort: [{ field: "price_cents", direction: "desc" }],
    });
    expect((byPrice.rows as Product[]).map((row) => row.name)).toEqual([
      "Ash standing desk",
      "Brass task light",
      "Walnut monitor riser",
      "Amber desk lamp",
      "Linen cable tray",
    ]);

    // The five seeded stocks are 0, 6, 12, 34 and 58, so this is a plain ascending order of the
    // store's own numbers. A list that ordered its own rows instead of asking would put the products
    // in seed order, which is by name here only by coincidence of how the seed was written.
    const byStock = await queryPageAction("products", {
      sort: [{ field: "stock", direction: "asc" }],
    });
    expect((byStock.rows as Product[]).map((row) => row.stock)).toEqual([0, 6, 12, 34, 58]);
  });

  it("compares a field, so a term in one field narrows without touching the rest of the record", async () => {
    const page = await queryPageAction("products", {
      filter: [{ field: "sku", operator: "contains", value: "LAMP" }],
    });

    // Case-folded on both sides, and two rows, so a comparison that matched the term exactly would
    // answer with one and a comparison that ignored the field would answer with all five.
    expect(page.total).toBe(2);
    expect((page.rows as Product[]).map((row) => row.sku).sort()).toEqual(["LAMP-001", "LAMP-002"]);
  });

  it("refuses a resource the demo does not expose, as every other call here does", async () => {
    // The paged call is a new way to reach the store, so it has to be behind the same closed set of
    // names as the five calls beside it. Without this, a table browser for products is also a table
    // browser for the user rows holding password hashes.
    await expect(queryPageAction("users", {})).rejects.toBeInstanceOf(AdminResourceNotExposedError);
    await expect(queryPageAction("sessions", {})).rejects.toBeInstanceOf(AdminResourceNotExposedError);
  });

  it("refuses a query that is not one, rather than answering part of it", async () => {
    // `limit` was a field match in the older form and a page size in this one. A caller that sends
    // it as the wrong one is refused rather than handed the empty list the older form answers with.
    await expect(queryPageAction("products", { limit: 2 } as never)).rejects.toThrow(/cannot be used/);
    await expect(
      queryPageAction("products", { window: { offset: 0, limit: 0 } } as never),
    ).rejects.toThrow(/cannot be used/);
  });
});

describe("what the demo's list is told its store can do", () => {
  it("is the paged call on the one that can page, and absent on the one that cannot", () => {
    // A generated list decides from the adapter's shape and not from a flag, so this pair is the
    // whole of the compatibility: a list on the second draws no search box, no sortable header, no
    // filter and no pager, and sees the rows it saw before.
    expect(typeof pagedClientPersistence.queryPage).toBe("function");
    expect(clientPersistence.queryPage).toBeUndefined();
  });

  it("is what both list pages read off the store, and pass down as the one boolean they can", async () => {
    // The reason the two pages are server components at all. A client page has no store to ask, so it
    // would be guessing, and a guess would put a search box over a store that cannot search. The
    // answer is a fact about the adapter, and the two pages read it the same way rather than each
    // deciding for itself.
    const { default: ProductsPage } = await import("../fixtures/app/shell/products/page");
    const { default: OrdersPage } = await import("../fixtures/app/shell/orders/page");
    const { DemoResourceList } = await import("../fixtures/components/demo-resource-list");
    const paged = typeof demoPersistence().adapter.queryPage === "function";

    expect(paged, "the demo's store answers a window, so both pages must say so").toBe(true);

    // The page is called rather than mounted, and what comes back is read, because the claim is about
    // the props the page hands the client component. Mounting would render through the adapter and
    // tell us what a visitor sees, which `demo-products-list.test.tsx` already does; a page that
    // computed the answer and dropped it would still render a working list, and only the props say so.
    for (const [name, page, resource] of [
      ["products", ProductsPage, "products"],
      ["orders", OrdersPage, "orders"],
    ] as const) {
      const child = page() as React.ReactElement<{ paged: boolean; definition: { resource: string } }>;
      expect(child.type, `${name} renders the demo's client list`).toBe(DemoResourceList);
      expect(child.props.paged, `${name} hands the client the store's own answer`).toBe(paged);
      // And the definition goes down with it, as the data it is, which is the property the prerender
      // refused before a column's format was a name rather than a function.
      expect(child.props.definition.resource, `${name} hands its own definition down`).toBe(resource);
    }
  });

  it("gives the products definition a control that can do something", () => {
    // A sortable column on a field no product stores, or a filter on one, is a control that looks
    // like it works and cannot. The seed is what the demo's own store is filled with.
    const stored = new Set(Object.keys(seedProducts[0]));
    const sortable = productsResource.columns.filter((column) => column.sortable === true);
    expect(sortable.length).toBeGreaterThan(0);
    for (const column of sortable) {
      expect(stored, `sortable column ${column.key}`).toContain(column.key);
    }
    for (const filter of productsResource.filters ?? []) {
      expect(stored, `filter ${filter.field}`).toContain(filter.field);
    }
    expect((productsResource.filters ?? []).length).toBeGreaterThan(0);
  });
});
