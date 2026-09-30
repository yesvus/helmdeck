// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminI18nProvider } from "../src/i18n";
import { AdminPermissionsProvider } from "../src/shell/permissions";
import {
  ADMIN_RESOURCE_REFERENCE_LIMIT,
  AdminResourceForm,
  AdminResourceList,
  createAdminResourceActions,
  createAdminPermissionGuard,
  defineAdminResource,
  evaluateAdminPermission,
  AdminPermissionDeniedError,
  AdminResourceReferenceError,
  type AdminAuditEvent,
  type AdminPersistenceAdapter,
  type AdminResourcePage,
  type AdminResourceQuery,
  type AdminSession,
} from "@yesvus/helmdeck";
import { createMemoryPersistenceAdapter } from "@yesvus/helmdeck/baseline";

/**
 * A column that names a row of another resource, asked of the store rather than answered here.
 *
 * The seam tests say what the demo's actions answer. This file is the other half: what a person sees
 * on a page generated from a definition carrying a reference, and whether the two halves of one
 * declaration, the form's choice and the list's filter, reach the store as the same question. Every
 * assertion about choices is on what the adapter was asked for, because a control that filtered a
 * hardcoded array would look identical to one that does not.
 */

const caller = vi.hoisted(() => ({ session: undefined as AdminSession | undefined }));

const owner: AdminSession = { email: "owner@demo.helmdeck.dev", role: "admin" };

/** The rule the demo already decides with, asked as the adapter the views read permissions through. */
const ruleAdapter = {
  can: async (permission: string) =>
    evaluateAdminPermission({
      rule: (session) => session?.role === "admin",
      session: caller.session ?? null,
      permission: permission as never,
    }),
};

function tree(node: ReactNode) {
  return (
    <AdminI18nProvider locale="en">
      <AdminPermissionsProvider adapter={ruleAdapter}>{node}</AdminPermissionsProvider>
    </AdminI18nProvider>
  );
}

const CUSTOMERS = [
  { id: "cus_root", name: "Root Group" },
  { id: "cus_a", name: "Alpha Ltd" },
  { id: "cus_b", name: "Beta Ltd" },
];

/**
 * The memory store, with every call recorded.
 *
 * The recording is the point of the file: a choice drawn from a constant in the component would
 * render the same options here, and only a record of what the adapter was asked distinguishes the
 * two. The answers are the store's own, so a test that wanted a different set would seed it rather
 * than expect a hardcoded one.
 */
function recordingStore() {
  // Seeded through the constructor rather than through `create`, because a `create` that is not
  // awaited is a row that may or may not be there when the assertion runs.
  const inner = createMemoryPersistenceAdapter({ customers: CUSTOMERS as never });
  const asked: Array<{ call: string; resource: string; query?: unknown; id?: string }> = [];
  // Every call is recorded before it is forwarded, so what these tests read is what the store was
  // asked rather than what a component did with the answer. Written per method rather than through
  // one generic wrapper because the adapter's own signatures are generic, and a wrapper that lost
  // `T` would make the recorder easier to write and the store harder to believe.
  // The second argument is a query for the reads that take one and a record id for the reads that
  // name a record, and which of the two it is says something worth keeping: a test asserting on a
  // reference asked the store for a window, and one asserting on a cycle asked it for a row.
  const note = (call: string, resource: string, second?: unknown) => {
    if (second === undefined) asked.push({ call, resource });
    else if (typeof second === "string") asked.push({ call, resource, id: second });
    else asked.push({ call, resource, query: second });
  };

  // The memory adapter's own `queryPage` is what makes this one a paged store, so a list draws its
  // search, filter and pager rather than falling back to the rows-only path. Read off the object
  // rather than assumed, because a test that declared `paged` for itself would not catch a change to
  // what the store actually answers.
  const paging = inner.queryPage;
  if (typeof paging !== "function") throw new Error("the memory adapter stopped paging");

  const persistence: AdminPersistenceAdapter = {
    ...inner,
    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      note("query", resource, query);
      return inner.query<T>(resource, query);
    },
    async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
      note("queryPage", resource, query);
      return paging<T>(resource, query);
    },
    async read<T>(resource: string, id: string): Promise<T | null> {
      note("read", resource, id);
      return inner.read<T>(resource, id);
    },
    async create<T>(resource: string, value: unknown): Promise<T> {
      note("create", resource, value);
      return inner.create<T>(resource, value);
    },
    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      note("update", resource, id);
      return inner.update<T>(resource, id, value);
    },
    async delete(resource: string, id: string): Promise<void> {
      note("delete", resource, id);
      return inner.delete(resource, id);
    },
  };

  return { persistence, asked, inner };
}

const shipments = defineAdminResource({
  resource: "shipments",
  label: "Shipments",
  path: "shipments",
  permissions: { read: "shipments.read", create: "shipments.create", update: "shipments.update" },
  columns: [
    { key: "tracking", header: "Tracking" },
    { key: "customer_id", header: "Customer", reference: { resource: "customers", label: "name" } },
  ],
  fields: [
    { name: "tracking", label: "Tracking", required: true },
    { name: "customer_id", label: "Customer", required: true, reference: { resource: "customers", label: "name" } },
  ],
});

/** One more than the choice window, so a page of them is a window rather than the whole set. */
const MORE_THAN_A_WINDOW = ADMIN_RESOURCE_REFERENCE_LIMIT + 5;

/** A refusal of the shape the package's guard throws, for an adapter that has to answer one here. */
function refused(permission: string) {
  return new AdminPermissionDeniedError({
    permission: permission as never,
    reason: "denied",
    session: null,
  });
}

beforeEach(() => {
  caller.session = owner;
});

describe("the choices a form offers for a reference", () => {
  it("asks the store for the rows, rather than offering a list written in the component", async () => {
    const { persistence, asked } = recordingStore();

    render(tree(<AdminResourceForm definition={shipments} persistence={persistence} />));

    const control = await screen.findByLabelText<HTMLSelectElement>("Customer");
    // Seeded by the store above, and the option text is the target's `name` rather than its id, which
    // is what a `label` on the declaration is for.
    expect([...control.options].map((option) => option.textContent)).toEqual([
      "Choose one",
      "Root Group",
      "Alpha Ltd",
      "Beta Ltd",
    ]);

    // And what it asked for: the target resource, through the same query contract as everything else.
    const choice = asked.find((call) => call.call === "queryPage" && call.resource === "customers");
    expect(choice).toBeDefined();
    expect(choice!.query).toEqual({ window: { offset: 0, limit: ADMIN_RESOURCE_REFERENCE_LIMIT } });
  });

  it("does not ask for a choice before the field is drawn, and asks once rather than per render", async () => {
    const { persistence, asked } = recordingStore();
    render(tree(<AdminResourceForm definition={shipments} persistence={persistence} />));
    await screen.findByLabelText<HTMLSelectElement>("Customer");

    await act(async () => {
      await userEvent.type(screen.getByLabelText("Tracking"), "HD-1");
    });

    // A definition with one reference asks about that one resource, once. A hook keyed on an object
    // identity rather than on what it is about would ask again on every keystroke.
    expect(asked.filter((call) => call.resource === "customers")).toHaveLength(1);
  });

  it("saves what was chosen, as the row's own id", async () => {
    const { persistence } = recordingStore();
    render(tree(<AdminResourceForm definition={shipments} persistence={persistence} />));

    await act(async () => {
      await userEvent.type(screen.getByLabelText("Tracking"), "HD-9");
    });
    await act(async () => {
      await userEvent.selectOptions(await screen.findByLabelText<HTMLSelectElement>("Customer"), "cus_b");
    });
    await act(async () => {
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    });

    const written = (await persistence.query<{ tracking: string; customer_id: unknown }>("shipments"))[0];
    expect(written.tracking).toBe("HD-9");
    expect(written.customer_id).toBe("cus_b");
  });

  it("stores null for a reference nothing was chosen for, rather than an empty string", async () => {
    const { persistence } = recordingStore();
    const nullable = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      permissions: { create: "shipments.create" },
      columns: [],
      fields: [
        { name: "tracking", label: "Tracking" },
        { name: "customer_id", label: "Customer", reference: { resource: "customers", label: "name" } },
      ],
    });

    render(tree(<AdminResourceForm definition={nullable} persistence={persistence} />));
    // Awaited rather than grabbed: the save button appears once the permission it is wrapped in has
    // been answered, and a click before that would be a click on nothing.
    const save = await screen.findByRole("button", { name: "Save" });
    await act(async () => {
      await userEvent.click(save);
    });

    // A database holding a foreign key column reads the empty string as a reference to a row whose id
    // is the empty string, which is a reference to nothing while looking like a value.
    const written = (await persistence.query<{ customer_id: unknown }>("shipments"))[0];
    expect(written.customer_id).toBeNull();
  });
});

describe("what a form does with a value the store did not offer", () => {
  it("offers the value the record already holds, so saving an unrelated field cannot clear it", async () => {
    const { persistence, inner } = recordingStore();
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_gone" });

    render(tree(<AdminResourceForm definition={shipments} persistence={persistence} id="shp_1" />));

    const control = await screen.findByLabelText<HTMLSelectElement>("Customer");
    // The store's three customers plus the value this record holds, which is not among them.
    expect(control.value).toBe("cus_gone");
    expect([...control.options].map((option) => option.value)).toContain("cus_gone");

    const save = await screen.findByRole("button", { name: "Save" });
    await act(async () => {
      await userEvent.click(save);
    });

    // Still there, rather than the reference having been quietly emptied by a form that only knew
    // about the rows it had been offered.
    const written = await inner.read<{ customer_id: unknown }>("shipments", "shp_1");
    expect(written?.customer_id).toBe("cus_gone");
  });

  it("says the choices are a window when the store holds more than the window carried", async () => {
    const { persistence, inner } = recordingStore();
    for (let index = 0; index < MORE_THAN_A_WINDOW; index += 1) {
      await inner.create("customers", {
        id: `cus_many_${String(index).padStart(4, "0")}`,
        name: `Many ${index}`,
      });
    }

    render(tree(<AdminResourceForm definition={shipments} persistence={persistence} />));
    const control = await screen.findByLabelText<HTMLSelectElement>("Customer");
    const total = MORE_THAN_A_WINDOW + CUSTOMERS.length;

    // The window the store answered for, and not one more, so the option list cannot be a page that
    // grows without end. The count comes back beside them and is said out loud, because a control
    // offering 100 of 108 without saying so is a control making a claim it cannot back.
    await waitFor(() => expect(control.options).toHaveLength(ADMIN_RESOURCE_REFERENCE_LIMIT + 1));
    expect(screen.getByText(new RegExp(`Showing ${ADMIN_RESOURCE_REFERENCE_LIMIT} of ${total}\\.`))).toBeInTheDocument();
  });
});

describe("the filter a list draws for a reference", () => {
  it("reaches the store as a comparison, and draws what came back", async () => {
    const { persistence, asked, inner } = recordingStore();
    for (const [id, customer_id] of [["shp_1", "cus_a"], ["shp_2", "cus_b"], ["shp_3", "cus_a"]] as const) {
      await inner.create("shipments", { id, tracking: id, customer_id });
    }

    render(tree(<AdminResourceList definition={shipments} persistence={persistence} />));
    await screen.findByRole("table");

    const control = await screen.findByLabelText<HTMLSelectElement>("Customer");
    expect([...control.options].map((option) => option.textContent)).toEqual([
      "All",
      "Root Group",
      "Alpha Ltd",
      "Beta Ltd",
    ]);

    await act(async () => {
      await userEvent.selectOptions(control, "cus_a");
    });

    // The store's own answer for the same query, rather than a list this file expected. A filter
    // applied to rows already fetched would give the same two rows, so the query is the evidence: the
    // comparison travelled to the adapter and the count beside the table is the store's.
    await waitFor(() => {
      const askedFilter = asked.find(
        (call) =>
          call.call === "queryPage" &&
          call.resource === "shipments" &&
          JSON.stringify(call.query).includes("cus_a"),
      );
      expect(askedFilter).toBeDefined();
      expect((askedFilter!.query as AdminResourceQuery).filter).toEqual([
        { field: "customer_id", operator: "eq", value: "cus_a" },
      ]);
    });

    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["shp_1", "shp_3"]);
    expect(screen.getByRole("status").textContent).toBe("Showing 1 to 2 of 2");
  });

  it("draws no filter for a reference the session may not read, rather than an empty one", async () => {
    const adminOnly = defineAdminResource({
      resource: "shipments",
      label: "Shipments",
      columns: [
        { key: "tracking", header: "Tracking" },
        { key: "order_id", header: "Order", reference: { resource: "orders" } },
      ],
      fields: [
        { name: "tracking", label: "Tracking" },
        { name: "order_id", label: "Order", reference: { resource: "orders" } },
      ],
      permissions: { read: "shipments.read" },
    });
    const { persistence, inner } = recordingStore();
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", order_id: "ord_real" });
    // The refusal happens on the server, so the adapter the list is handed refuses the read of
    // orders rather than answering it with an empty set. A stand-in that answered would be testing a
    // different thing: the point is that no choices exist, not that the component hides them.
    const refusing: AdminPersistenceAdapter = {
      ...persistence,
      queryPage: async (resource, query) => {
        if (resource === "orders") throw refused("orders.read");
        return persistence.queryPage!(resource, query);
      },
      query: async (resource, query) => {
        if (resource === "orders") throw refused("orders.read");
        return persistence.query(resource, query);
      },
    };

    render(tree(<AdminResourceList definition={adminOnly} persistence={refusing} />));
    await screen.findByRole("table");

    // The shipments themselves are readable, so their table is there. And the filter over orders is
    // not drawn at all, because a control that can only say "no filter" is the control this contract
    // says not to draw.
    await waitFor(() => expect(screen.getByText("HD-1")).toBeInTheDocument());
    expect(screen.queryByLabelText("Order")).not.toBeInTheDocument();
  });
});

describe("what a list prints for a value naming a row", () => {
  it("prints the row's label, and says so when there is no row", async () => {
    const { persistence, inner } = recordingStore();
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_a" });
    await inner.create("shipments", { id: "shp_2", tracking: "HD-2", customer_id: "cus_gone" });

    render(tree(<AdminResourceList definition={shipments} persistence={persistence} />));
    const table = await screen.findByRole("table");
    const cells = (tracking: string) => {
      const row = within(table)
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryByText(tracking) !== null);
      return within(row!).getAllByRole("cell")[1].textContent;
    };

    // The named row by its label, and the dangling value named as such rather than printed as an id a
    // reader would take for a customer.
    await waitFor(() => expect(cells("HD-1")).toBe("Alpha Ltd"));
    expect(cells("HD-2")).toBe("No such row");
  });
});

describe("a reference that points at its own resource", () => {
  const customers = defineAdminResource({
    resource: "customers",
    label: "Customers",
    permissions: { read: "customers.read", create: "customers.create", update: "customers.update" },
    columns: [
      { key: "name", header: "Name" },
      { key: "parent_id", header: "Group", reference: { resource: "customers", label: "name" } },
    ],
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "parent_id", label: "Group", reference: { resource: "customers", label: "name" } },
    ],
  });

  it("terminates on a row whose parent is its own ancestor, rather than walking the cycle", async () => {
    const { persistence, asked, inner } = recordingStore();
    // A cycle of two rather than a row pointing at itself, because a self-reference is the least
    // interesting case: an implementation that follows a chain at all stops on it by accident, and a
    // test against one proves nothing. Here X's parent is Y and Y's parent is X, so following
    // references never runs out of rows.
    await inner.create("customers", { id: "cus_x", name: "X", parent_id: "cus_y" });
    await inner.create("customers", { id: "cus_y", name: "Y", parent_id: "cus_x" });

    render(tree(<AdminResourceList definition={customers} persistence={persistence} />));
    const table = await screen.findByRole("table");

    // Both cells resolved, to their own target's label, and the render finished. Asking one hop is
    // what makes this terminate: X's cell needs Y's name and nothing at all about Y's parent.
    // Matched on the row's own first cell rather than anywhere in it, because each row also carries
    // the name of the row it points at, and a search over the whole row finds whichever came first.
    // Header cells are read with `queryAllByRole`, which is empty for the header row rather than an
    // error, so a row of headings cannot throw on the way to the one being looked for.
    const parentOf = (name: string) => {
      const row = within(table)
        .getAllByRole("row")
        .find((candidate) => within(candidate).queryAllByRole("cell")[0]?.textContent === name);
      return row === undefined ? null : (within(row).queryAllByRole("cell")[1]?.textContent ?? null);
    };
    await waitFor(() => expect(parentOf("X")).toBe("Y"));
    expect(parentOf("Y")).toBe("X");

    // And the claim the rendered cells cannot make on their own: the store was asked for each value
    // on the page once, and not for what those values point at in turn. A resolution that followed
    // the chain draws these same two cells and asks again for every one of them, for ever, so a test
    // that only read the screen would report that as a pass.
    const resolved = asked.filter((call) => call.call === "read" && call.resource === "customers");
    await waitFor(() => expect(resolved.length).toBeGreaterThan(0));
    expect(resolved.map((call) => call.id).sort()).toEqual(["cus_x", "cus_y"]);
  });

  it("offers the rows that exist for a self-referencing field, and refuses a value that names none", async () => {
    const { persistence } = recordingStore();
    const store = createAdminResourceActions({
      guard: createAdminPermissionGuard({
        rule: (session) => session?.role === "admin",
        session: () => caller.session ?? null,
      }),
      persistence,
      definitions: [customers],
    });

    await expect(
      store.create("customers", { name: "Z", parent_id: "cus_not_a_row" }),
    ).rejects.toThrow(AdminResourceReferenceError);

    // And the same call with a value the store holds, which is the case a check on a list of choices
    // would get wrong: the choices are a window, so a value outside it is still a real reference.
    const created = await store.create("customers", { name: "Z", parent_id: "cus_b" });
    expect(created).toMatchObject({ parent_id: "cus_b" });
  });
});

describe("a reference to a resource the session may not read", () => {
  const shipmentsWithOrder = defineAdminResource({
    resource: "shipments",
    label: "Shipments",
    permissions: { read: "shipments.read", create: "shipments.create", update: "shipments.update" },
    // `tracking` is a stored column as well as a form field. Listing it in `fields` alone left the
    // definition saying the record carries a value a write was then refused for naming, and the
    // refusal arrived ahead of the permission answer this file is about.
    columns: [
      { key: "tracking", header: "Tracking" },
      { key: "order_id", header: "Order", reference: { resource: "orders" } },
    ],
    fields: [
      { name: "tracking", label: "Tracking" },
      { name: "order_id", label: "Order", reference: { resource: "orders" } },
    ],
  });

  /** The store behind the actions, and the rule the guard asks, narrowed to a set of resources. */
  function boundary(allowed: (resource: string) => boolean) {
    const { persistence, inner } = recordingStore();
    return {
      persistence,
      inner,
      store: createAdminResourceActions({
        guard: createAdminPermissionGuard({
          rule: (session, permission) =>
            session?.role === "admin" &&
            permission.split(".").length === 2 &&
            allowed(permission.split(".")[0]),
          session: () => caller.session ?? null,
        }),
        persistence,
        definitions: [shipmentsWithOrder],
      }),
    };
  }

  it("refuses a write naming one, and does not let the answer differ for a row that exists", async () => {
    const { store, inner } = boundary((resource) => resource === "shipments");
    await inner.create("orders", { id: "ord_real", total_cents: 100 });

    // The call an attacker makes, and the two of them answered the same way. No page draws a choice
    // here for this session, so the only thing standing between a guess and a read of another
    // resource's rows is the refusal, and an error that differed between a real id and an invented
    // one would be an oracle for exactly that question.
    const attempt = (order_id: string) =>
      store.create("shipments", { tracking: "HD-1", order_id });
    const answer = async (order_id: string) => {
      try {
        await attempt(order_id);
        return "allowed";
      } catch (cause) {
        return cause instanceof AdminPermissionDeniedError ? `denied: ${cause.permission}` : String(cause);
      }
    };

    expect(await answer("ord_real")).toBe("denied: orders.read");
    expect(await answer("ord_invented")).toBe("denied: orders.read");
    // Nothing was written, so a refused write is not a half-done one.
    expect(await inner.query("shipments")).toHaveLength(0);
  });

  it("refuses the read of the target before the store is asked whether the row is there", async () => {
    const { store, inner, persistence } = boundary((resource) => resource === "shipments");
    await inner.create("orders", { id: "ord_real" });
    const read = vi.spyOn(persistence, "read");

    await expect(store.create("shipments", { tracking: "HD-1", order_id: "ord_real" })).rejects.toThrow(
      AdminPermissionDeniedError,
    );

    // The guard ran first, so a session refused orders was never told whether the id it guessed was a
    // real one.
    expect(read).not.toHaveBeenCalledWith("orders", "ord_real");
  });

  it("refuses an update that changes the value, and does not let the answer differ for a row that exists", async () => {
    const { store, inner } = boundary((resource) => resource === "shipments");
    await inner.create("orders", { id: "ord_real" });
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", order_id: "ord_kept" });

    // Both of these change what the record holds, which is the half that is still checked in full: a
    // write introducing a value is a claim about another resource's rows, and the claim is refused
    // without saying whether the id names one.
    const answer = async (order_id: string) => {
      try {
        await store.update("shipments", "shp_1", { tracking: "HD-1", order_id });
        return "allowed";
      } catch (cause) {
        return cause instanceof AdminPermissionDeniedError ? `denied: ${cause.permission}` : String(cause);
      }
    };
    const real = await answer("ord_real");
    const invented = await answer("ord_invented");

    expect(real).toBe("denied: orders.read");
    expect(invented).toBe(real);
    // And the record kept the value it had, so a refused change is not a half-applied one.
    expect(await inner.read("shipments", "shp_1")).toMatchObject({ order_id: "ord_kept" });
  });

  it("saves a record whose value the session cannot read, which is the one the form offers", async () => {
    const { store, inner, persistence } = boundary((resource) => resource === "shipments");
    await inner.create("orders", { id: "ord_real" });
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", order_id: "ord_real" });
    const read = vi.spyOn(persistence, "read");

    // The form is handed the guarded actions rather than the adapter behind them, because the claim
    // under test is what the two halves do together. A form that saves through a boundary the page
    // never posts to would agree with nothing.
    render(tree(<AdminResourceForm definition={shipmentsWithOrder} persistence={store} id="shp_1" />));

    // The form's half: this session may not read orders, so the control offers the value the record
    // already holds and nothing else, and says why. Dropping it instead would empty the column the
    // moment somebody fixed a typo in the tracking.
    const control = await screen.findByLabelText<HTMLSelectElement>("Order");
    await waitFor(() =>
      expect(screen.getByText(/only the current value is offered/)).toBeInTheDocument(),
    );
    expect([...control.options].map((option) => option.value)).toEqual(["", "ord_real"]);

    await act(async () => {
      await userEvent.clear(screen.getByLabelText("Tracking"));
      await userEvent.type(screen.getByLabelText("Tracking"), "HD-2");
    });
    await act(async () => {
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    });

    // The server's half: the write landed and the value is still on the record, and the target was
    // never read to find that out. An unchanged value is not this write's to check, so a record
    // holding a reference this session may not follow is still editable by somebody who may edit it.
    // Either half drifting fails here: a server that checked the value would refuse the save, and a
    // form that offered nothing would save the empty string over it.
    expect(await inner.read<{ tracking: string; order_id: unknown }>("shipments", "shp_1")).toMatchObject({
      tracking: "HD-2",
      order_id: "ord_real",
    });
    expect(read).not.toHaveBeenCalledWith("orders", "ord_real");
  });
});

describe("a value a write does not change", () => {
  /** A boundary over the shipments' own reference, with nothing withheld from this session. */
  function open() {
    const { persistence, asked, inner } = recordingStore();
    return {
      inner,
      asked,
      store: createAdminResourceActions({
        guard: createAdminPermissionGuard({
          rule: () => true,
          session: () => caller.session ?? null,
        }),
        persistence,
        definitions: [shipments],
      }),
    };
  }

  it("asks the target nothing for a value the record already holds, and checks one it changes", async () => {
    const { store, inner, asked } = open();
    const readsOf = (resource: string) =>
      asked.filter((call) => call.call === "read" && call.resource === resource);
    // A row the store no longer holds, and the record still pointing at it. The write did not put
    // that value there, so refusing it would make a stale record uneditable rather than true, and
    // the list keeps saying "No such row" about it either way.
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_gone" });

    const kept = await store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "cus_gone" });
    expect(kept).toMatchObject({ customer_id: "cus_gone" });
    expect(readsOf("customers")).toHaveLength(0);

    // Changed to a row the store holds, which is a new claim and is checked the way a create's is.
    await store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "cus_a" });
    expect(readsOf("customers")).toEqual([{ call: "read", resource: "customers", id: "cus_a" }]);

    // And changed to one it does not, which is refused by name rather than stored.
    await expect(
      store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "cus_nope" }),
    ).rejects.toThrow(/shipments\.customer_id names "cus_nope"/);
  });

  it("reads a stored id and a written one the same way, so a store that numbers its rows is not a change", async () => {
    const { store, inner, asked } = open();
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: 7 });

    // A form sends a string whatever the store holds, and a store that numbers its rows is ordinary
    // for half of them. Compared as they arrived, `7` and `"7"` would be a change, and a value the
    // write did not touch would be checked against a target the session may not read.
    await expect(
      store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "7" }),
    ).resolves.toMatchObject({ tracking: "HD-2" });
    expect(asked.filter((call) => call.call === "read" && call.resource === "customers")).toHaveLength(0);
  });

  it("checks a create's values, because a create introduced each of them", async () => {
    const { store, asked } = open();
    const readsOf = () =>
      asked.filter((call) => call.call === "read" && call.resource === "customers").map((call) => call.id);

    await store.create("shipments", { tracking: "HD-1", customer_id: "cus_a" });
    await expect(
      store.create("shipments", { tracking: "HD-2", customer_id: "cus_nope" }),
    ).rejects.toThrow(AdminResourceReferenceError);
    // A create with nothing chosen for the reference names no row, so there is nothing to ask, and
    // the two that named one were each checked once against the store.
    await store.create("shipments", { tracking: "HD-3", customer_id: null });
    expect(readsOf()).toEqual(["cus_a", "cus_nope"]);
  });
});

describe("a write that is audited and checked at once", () => {
  /**
   * The store behind the actions, with every call recorded in the order the seam reached it.
   *
   * The two halves of this file each came from a change that moved the same function, and each one's
   * own tests pass with the other missing: the audit's order test updates a record holding no
   * reference, and the reference tests wire no audit and no cache. A write that does both is the one
   * call neither of them made, so it is the one a merge can get wrong with everything else green.
   */
  function tracked(order: string[]) {
    const { persistence, inner } = recordingStore();
    return {
      inner,
      persistence: {
        ...persistence,
        read<T>(resource: string, id: string) {
          order.push(`read:${resource}:${id}`);
          return persistence.read<T>(resource, id);
        },
        create<T>(resource: string, value: unknown) {
          order.push(`create:${resource}`);
          return persistence.create<T>(resource, value);
        },
        update<T>(resource: string, id: string, value: unknown) {
          order.push(`update:${resource}:${id}`);
          return persistence.update<T>(resource, id, value);
        },
        delete(resource: string, id: string) {
          order.push(`delete:${resource}:${id}`);
          return persistence.delete(resource, id);
        },
      } satisfies AdminPersistenceAdapter,
    };
  }

  /** The boundary as a host wires all of it, with every prepared call named in the log. */
  function seam(order: string[], events: AdminAuditEvent[]) {
    const store = tracked(order);
    return {
      ...store,
      store: createAdminResourceActions({
        guard: createAdminPermissionGuard({
          rule: () => true,
          session: () => caller.session ?? null,
        }),
        persistence: store.persistence,
        before: ({ resource, operation, resourceId }) => {
          order.push(`before:${operation}:${resource}:${resourceId ?? ""}`);
        },
        audit: {
          record: async (event) => {
            order.push("audit");
            events.push(event);
          },
        },
        cache: { invalidate: async () => void order.push("cache") },
        definitions: [shipments],
      }),
    };
  }

  it("prepares, reads the record it replaces, checks the value, writes, records and invalidates", async () => {
    const order: string[] = [];
    const events: AdminAuditEvent[] = [];
    const { store, inner } = seam(order, events);
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_b" });
    order.length = 0;

    await store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "cus_a" });

    // One list, and every line of it load-bearing. The two reads of the record being written are
    // both there: the one that decides which values this write introduced goes straight to the store,
    // so it prepares nothing, and the one that checks the value it introduced is a permitted call of
    // its own and prepares as one. Route that first read through `permit` and a third `before` shows
    // up here; drop the check and four lines go; move either half of the reporting and the tail moves.
    expect(order).toEqual([
      "before:update:shipments:shp_1",
      "read:shipments:shp_1",
      "before:read:customers:cus_a",
      "read:customers:cus_a",
      "update:shipments:shp_1",
      "audit",
      "cache",
    ]);
    // The event is the one the guard decided for, which is what returning the session from `permit`
    // is for, and it names the record the call named rather than only what the store returned.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "update",
      resource: "shipments",
      resourceId: "shp_1",
      actor: owner,
    });
  });

  it("records nothing for a value the check refuses, which is a refusal like any other", async () => {
    const order: string[] = [];
    const events: AdminAuditEvent[] = [];
    const { store, inner } = seam(order, events);
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_b" });
    order.length = 0;

    await expect(
      store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: "cus_gone" }),
    ).rejects.toThrow(AdminResourceReferenceError);

    // The guard is asked about the target before the store is, so a refused value says nothing about
    // whether the row is there, and the trail says nothing about a write that did not happen. A
    // resolution that reported before checking would leave a change the event claims and the table
    // never took.
    expect(order).toEqual([
      "before:update:shipments:shp_1",
      "read:shipments:shp_1",
      "before:read:customers:cus_gone",
      "read:customers:cus_gone",
    ]);
    expect(events).toHaveLength(0);
    expect(await inner.read("shipments", "shp_1")).toMatchObject({
      tracking: "HD-1",
      customer_id: "cus_b",
    });
  });

  it("reads nothing extra for a write that names no reference, and prepares once", async () => {
    const order: string[] = [];
    const events: AdminAuditEvent[] = [];
    const { store, inner } = seam(order, events);
    await inner.create("shipments", { id: "shp_1", tracking: "HD-1", customer_id: "cus_b" });
    order.length = 0;

    await store.update("shipments", "shp_1", { tracking: "HD-2", customer_id: null });

    // The cost of deciding what a write introduced is one read of the record, and it is paid only by
    // a write that introduces something. A read here would be a store call the check itself did not
    // need, on the path every write through this seam takes.
    expect(order).toEqual(["before:update:shipments:shp_1", "update:shipments:shp_1", "audit", "cache"]);
    expect(events).toHaveLength(1);
  });
});
