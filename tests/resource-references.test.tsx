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
  const note = (call: string, resource: string, second?: unknown) => {
    asked.push(second === undefined ? { call, resource } : { call, resource, query: second });
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

  it("terminates on a row whose parent is its own ancestor, rather than walking forever", async () => {
    const { persistence, inner } = recordingStore();
    // A chain rather than a single self-reference, because a cycle of two is the shape that would
    // loop if a view followed references, and a row pointing at itself is the least interesting case.
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
    columns: [{ key: "order_id", header: "Order", reference: { resource: "orders" } }],
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
});
