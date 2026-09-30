// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import {
  createAdminPermissionGuard,
  evaluateAdminPermission,
  type AdminPermissionsAdapter,
  type AdminSession,
} from "@yesvus/helmdeck";
import ProductsPage from "../fixtures/app/shell/products/page";
import { productsResource } from "../fixtures/lib/admin-resources";
import { demoCan } from "../fixtures/lib/demo-rules";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { createResourceAction, queryPageAction } from "../fixtures/lib/resource-actions";
import { seedProducts } from "../fixtures/lib/seed-data";

/**
 * The demo's product list, rendered, with every control on it reaching the demo's store.
 *
 * The seam tests ask what the demo's actions answer, which is the store's half. This file is the
 * other half: what a person sees on the page the demo serves, and whether the search box, the
 * sortable headers, the filter and the pager change what the store was asked and therefore what
 * comes back. A list that narrowed its own rows would render the same rows for every one of those
 * controls, so each case below compares what is on screen against what the store answers for the
 * same query rather than against a list written out here.
 *
 * The store is the demo's own, with more products than the seed holds, because the seeded five fit
 * on one page and a pager that has never been asked for a second page has not been tested. The extra
 * products are written through the same action a visitor's form posts to, so they arrive the way a
 * visitor's would.
 */

const caller = vi.hoisted(() => ({ session: undefined as AdminSession | undefined }));

/**
 * The session the guard reads, stood in for.
 *
 * The real one resolves a signed cookie, and the session adapter refuses to read a cookie from a
 * browser-shaped environment, which is what jsdom is. Everything below the guard is the demo's own:
 * the rule, the actions and the store.
 */
vi.mock("../fixtures/lib/demo-guard", async () => {
  const actual = await vi.importActual<typeof import("../fixtures/lib/demo-guard")>(
    "../fixtures/lib/demo-guard",
  );
  const { demoCan: can } = await import("../fixtures/lib/demo-rules");
  return {
    ...actual,
    requireDemoSession: vi.fn(async () => {
      if (!caller.session) throw new Error("no session");
      return caller.session;
    }),
    requireDemoPermission: createAdminPermissionGuard({
      rule: can,
      session: () => caller.session ?? null,
    }),
  };
});

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/shell/products",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...rest }, children),
}));

type Product = { id: string; name: string; sku: string; price_cents: number; stock: number };

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };
const store = demoPersistence().adapter;

/** One more page than a single one, so the pager has a second page to offer. */
const PADDED = 45;

/**
 * The rule the demo already decides with, asked as the adapter the views read permissions through.
 *
 * The buttons rendered are then the ones the actions serve, because both sides ask this one rule: a
 * stand-in that answered yes to everything would render a control an action then refuses, which is
 * the disagreement the demo exists to make impossible.
 */
const ruleAdapter: AdminPermissionsAdapter = {
  can: async (permission, context) =>
    evaluateAdminPermission({ rule: demoCan, session: caller.session ?? null, permission, context }),
};

function tree(node: ReactNode) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={ruleAdapter}>{node}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

/** The count the list shows, which is the store's answer to a window and the only count there is. */
function count() {
  return screen.getByRole("status").textContent;
}

/** The names in the table, which is what a control changing the order or the set looks like. */
async function names() {
  const table = await screen.findByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

beforeEach(async () => {
  caller.session = owner;
  await ensureDemoSeeded();

  // The seed writes its own rows back by id, so the seeded products are already what the seed says
  // they are. Anything else is a row a previous test left, and it goes through the same seam a
  // visitor's delete does rather than around it.
  //
  // They are not re-created through the action, and that is the seam working: a write is filtered
  // down to the fields the definition declares, and the products definition declares no `id`, so a
  // seeded row posted through it would be stored under an id of the store's own choosing. Two copies
  // of every seeded product, under two ids, is what that would leave behind.
  const seeded = new Set(seedProducts.map((row) => row.id));
  for (const row of await store.query<{ id: string }>("products")) {
    if (!seeded.has(row.id)) await store.delete("products", row.id);
  }
  // Padded above the forty a page holds, with names and prices that make an ordering checkable and
  // a search for a term of its own narrow to a known number of rows.
  for (let index = 0; index < PADDED; index += 1) {
    await createResourceAction("products", {
      id: `prd_padded_${String(index).padStart(3, "0")}`,
      name: `Padded ${String(index).padStart(3, "0")}`,
      sku: `PAD-${String(index).padStart(3, "0")}`,
      price_cents: 1000 + index,
      stock: index,
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the controls the demo's product list draws", () => {
  it("offers a search box, sortable headers, a filter and a pager, over the store it was given", async () => {
    render(tree(<ProductsPage />));
    await screen.findByRole("table");

    // Four controls, and each one is asked of the store rather than applied here.
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByLabelText("SKU contains")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });

  it("counts the store's records rather than the page it is holding", async () => {
    render(tree(<ProductsPage />));
    await screen.findByRole("table");

    // Fifty in the store, forty on the page, and the count is the fifty. A count taken from the page
    // would say forty here and would then offer a second page of a list that has nothing on it.
    const held = await store.query("products");
    expect(held.length).toBe(PADDED + seedProducts.length);
    expect(count()).toBe(`Showing 1 to 40 of ${held.length}`);
    expect(await names()).toHaveLength(40);
  });

  it("prints the price and the stock the way the definition asked for", async () => {
    render(tree(<ProductsPage />));
    await screen.findByRole("table");

    // Asserted on the page rather than on the definition, because a definition naming a formatter
    // says nothing about what the reader is shown. `LAMP-001` is 4900 cents with 34 in stock and
    // `RISR-001` has none, so these are the two cells a list printing the stored number would get
    // wrong: `$49.00` rather than `4900`, and a reader told there is stock where there is none.
    //
    // The four declared columns, and the row carries a fifth cell for the row actions the
    // permissions draw, which is why the price and stock are read by position rather than the whole
    // row compared: an empty cell from an unrelated control would otherwise fail this for a reason
    // that has nothing to do with the formatting.
    const cellsFor = (sku: string) => {
      const row = within(screen.getByRole("table"))
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryByText(sku) !== null);
      return within(row!).getAllByRole("cell").map((cell) => cell.textContent).slice(0, 4);
    };

    expect(cellsFor("LAMP-001")).toEqual(["Amber desk lamp", "LAMP-001", "$49.00", "34"]);
    expect(cellsFor("RISR-001")).toEqual(["Walnut monitor riser", "RISR-001", "$59.00", "Out of stock"]);
  });
});

describe("what each control asks the store for", () => {
  it("sends a typed term to the store, and renders the store's answer to it", async () => {
    render(tree(<ProductsPage />));
    await names();

    await act(async () => {
      await userEvent.type(screen.getByLabelText("Search"), "Padded 007");
    });

    // One product carries that name, and the count narrows to it. A list that filtered its own rows
    // would have had to fetch all fifty to hide forty-nine of them, and the count beside them would
    // have had to be computed from rows the store never said matched.
    await waitFor(() => expect(count()).toBe("Showing 1 to 1 of 1"));
    expect(await names()).toEqual(["Padded 007"]);
  });

  it("sends a filter's value to the store as a comparison, and renders what came back", async () => {
    render(tree(<ProductsPage />));
    await names();

    const filter = screen.getByLabelText("SKU contains");
    await act(async () => {
      await userEvent.type(filter, "LAMP");
    });

    // The two seeded lamps, out of fifty products. A filter applied to the fetched rows would give
    // the same two rows here, so the count is the part that says the store narrowed: it is the
    // store's two and not the fifty the list would have had to narrow itself.
    await waitFor(() => expect(count()).toBe("Showing 1 to 2 of 2"));
    expect((await names()).sort()).toEqual(["Amber desk lamp", "Brass task light"]);
  });

  it("sends an ordering to the store, and leaves the rows in the order the store sent them", async () => {
    render(tree(<ProductsPage />));
    await names();

    // The prices run from 1,000 to 1,044 across the padded rows, so ascending by price reads as the
    // padded rows in the order they were written and the four cheapest seeded products after them.
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Price/ }));
    });

    const ascending = await names();
    await waitFor(() => expect(ascending[0]).toBe("Padded 000"));
    expect(ascending).toHaveLength(40);

    // Asked of the store directly, for the same query, so what is on screen is compared against the
    // store's own answer rather than against the order this file expected.
    const asked = await queryPageAction("products", {
      sort: [{ field: "price_cents", direction: "asc" }],
      window: { offset: 0, limit: 40 },
    });
    expect(ascending).toEqual((asked.rows as Product[]).map((row) => row.name));

    // The second click is the other direction, and it is the store that reverses, not the list.
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Price/ }));
    });
    const descending = await names();
    await waitFor(() => expect(descending[0]).toBe("Ash standing desk"));
    expect(descending[0]).not.toBe(ascending[0]);
  });

  it("sends a window to the store, and the second page holds the rows the first did not", async () => {
    render(tree(<ProductsPage />));
    const first = await names();
    expect(first).toHaveLength(40);

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    await act(async () => {
      await userEvent.click(within(nav).getByRole("button", { name: "Page 2" }));
    });

    // Ten rows on the second page of fifty, the ten the first page did not hold, and a count that
    // still says fifty. A list holding its own rows would have had nothing to page, and a count
    // taken from the page would have said ten.
    const second = await names();
    await waitFor(() => expect(count()).toBe("Showing 41 to 50 of 50"));
    expect(second).toHaveLength(10);
    expect(new Set([...first, ...second]).size).toBe(50);
  });
});

describe("a query that matches nothing", () => {
  it("says so, rather than showing an empty table with no explanation", async () => {
    render(tree(<ProductsPage />));
    await names();

    await act(async () => {
      await userEvent.type(screen.getByLabelText("Search"), "no product carries this");
    });

    // The store's answer is zero rows and a count of zero, and the list says which of the two
    // claims it is making. "Nothing here yet" would claim the demo has no products, which is a
    // different claim and a wrong one.
    expect(await screen.findByText("No records match what you searched for.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says the same for a filter that matches nothing", async () => {
    render(tree(<ProductsPage />));
    await names();

    await act(async () => {
      await userEvent.type(screen.getByLabelText("SKU contains"), "NO-SUCH-SKU");
    });

    expect(await screen.findByText("No records match what you searched for.")).toBeInTheDocument();
  });
});

describe("a host whose adapter cannot page", () => {
  it("sees the list it saw before, with no dead controls", async () => {
    // The same products definition, which declares four sortable columns and a filter, on the
    // demo's other client adapter: the one whose store cannot answer a paged query. Every control
    // below is absent because the adapter cannot make it work, not because the definition is silent,
    // and the rows are still the store's.
    const { clientPersistence } = await import("../fixtures/lib/client-persistence");
    const { AdminResourceList } = await import("@yesvus/helmdeck");
    const { demoFormatters } = await import("../fixtures/lib/admin-resources");

    // The same props the page's own client component passes, since the definition names the demo's
    // `stock` formatter and a list that nobody registered it for has no way to print that column.
    render(
      tree(
        <AdminResourceList
          definition={productsResource}
          persistence={clientPersistence}
          detailBaseHref="/shell/products"
          formatters={demoFormatters}
        />,
      ),
    );

    const shown = await names();
    expect(shown.length).toBeGreaterThan(0);

    expect(clientPersistence.queryPage).toBeUndefined();
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("SKU contains")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Name/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Price/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
    // And no count, because a store that said nothing about how many there are has not earned a
    // claim about the size of the list.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
