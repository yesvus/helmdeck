// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminPermissionDeniedError,
  AdminResourceNotExposedError,
  AdminResourceReferenceError,
} from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import {
  createResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "../fixtures/lib/resource-actions";
import { seedCustomers, seedOrders, seedShipments } from "../fixtures/lib/seed-data";

/**
 * The demo's references, asked of its own actions with the session a signed cookie resolves to.
 *
 * The rendering is in `resource-references.test.tsx`. What is here is the half that refuses, and it
 * is here rather than in a page because a hidden select is not authorization: every call below is
 * the one a browser would post to, with an argument the UI never offers, and the question is what the
 * server answers rather than what was drawn.
 *
 * The demo's `shipments` table is the case worth having. `customer_id` names a customers row, which
 * an editor may read, and `order_id` names an orders row, which an editor may not. A reference is
 * resolved by reading the row it names, so the second one is a column whose target is refused: no
 * choices are offered, and a write naming an order is refused by the same guard, identically whether
 * or not that order is real.
 */

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal };
});

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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok, `${account.email} could not sign in`).toBe(true);
  return request.session;
}

/** What a call was answered with, named by the class that refused it rather than by its message. */
async function refused(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
    return "allowed";
  } catch (cause) {
    if (cause instanceof AdminPermissionDeniedError) return `denied: ${cause.permission}`;
    if (cause instanceof AdminResourceNotExposedError) return `not exposed: ${cause.resource}`;
    if (cause instanceof AdminResourceReferenceError) return `dangling: ${cause.message}`;
    return `other: ${String(cause)}`;
  }
}

beforeEach(async () => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. The actions are server code, so they run without one.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  // Shipments a previous case left behind, removed through the same action a visitor's delete goes
  // through rather than around it, so the store is the seeded five whatever ran before.
  const seeded = new Set<string>(seedShipments.map((row) => row.id));
  for (const row of await store.query<{ id: string }>("shipments")) {
    if (!seeded.has(row.id)) await store.delete("shipments", row.id);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a reference the session may follow", () => {
  it("serves a write naming a row the store holds, and refuses one naming a row it does not", async () => {
    await signIn(owner);
    const customer = seedCustomers[0].id;

    // The seeded five all name customers that exist, which is the first half of the claim: a check
    // that refused these would make the column unusable rather than safe.
    expect(await queryResourceAction("shipments")).toHaveLength(seedShipments.length);

    const created = (await createResourceAction("shipments", {
      tracking: "HD-TEST",
      status: "label_created",
      customer_id: customer,
    })) as { id: string };
    expect(created).toMatchObject({ customer_id: customer });

    // And the second half, which is the property: a value naming a row the store does not hold is
    // refused before the write, and the message names the field rather than only the write.
    await expect(
      createResourceAction("shipments", {
        tracking: "HD-GHOST",
        customer_id: "cus_not_a_row",
      }),
    ).rejects.toThrow(AdminResourceReferenceError);
    await expect(
      createResourceAction("shipments", { tracking: "HD-GHOST", customer_id: "cus_not_a_row" }),
    ).rejects.toThrow(/shipments\.customer_id names "cus_not_a_row"/);

    // Nothing was stored, so a refused reference is not a half-written one.
    const stored = (await queryResourceAction("shipments")) as Array<{ tracking: string }>;
    expect(stored.filter((row) => row.tracking === "HD-GHOST")).toHaveLength(0);
    await store.delete("shipments", created.id);
  });

  it("checks a reference on an update as well as a create, so a second write cannot smuggle one in", async () => {
    await signIn(owner);
    const shipment = seedShipments[0];

    await expect(
      updateResourceAction("shipments", shipment.id, { customer_id: "cus_not_a_row" }),
    ).rejects.toThrow(AdminResourceReferenceError);

    // The record is untouched, which is the difference between refusing a write and cleaning up after
    // one: a half-applied update would have left the tracking changed and the customer dangling.
    expect(await readResourceAction("shipments", shipment.id)).toMatchObject({
      tracking: shipment.tracking,
      customer_id: shipment.customer_id,
    });
  });

  it("accepts a value naming a customer the form was never offered, because the store holds it", async () => {
    await signIn(owner);
    // The check is a read of the target rather than a membership test over the choices a control was
    // drawn from, which is what lets a reference past a window of options still be a real reference.
    // A customer created after the form's choices were asked for is exactly that case.
    await store.create("customers", { id: "cus_late", name: "Late Arrival", tier: "standard" });

    const created = (await createResourceAction("shipments", {
      tracking: "HD-LATE",
      customer_id: "cus_late",
    })) as { id: string };

    expect(created).toMatchObject({ customer_id: "cus_late" });
    await store.delete("shipments", created.id);
    await store.delete("customers", "cus_late");
  });

  it("accepts a self-reference, and a cycle of rows the store can hold", async () => {
    await signIn(owner);
    // `customers.parent_id` names a customers row, so every value in it resolves to a row that
    // resolves in turn. Each check is one read of the target and never asks what the target's own
    // values are, which is the whole of how a cycle terminates here.
    await store.create("customers", { id: "cus_loop_a", name: "Loop A", parent_id: "cus_loop_b" });
    await store.create("customers", { id: "cus_loop_b", name: "Loop B", parent_id: "cus_loop_a" });

    const first = (await createResourceAction("customers", {
      name: "Loop C",
      parent_id: "cus_loop_a",
    })) as { id: string };
    expect(first).toMatchObject({ parent_id: "cus_loop_a" });

    for (const id of [first.id, "cus_loop_a", "cus_loop_b"]) await store.delete("customers", id);
  });
});

describe("a reference to a resource the session may not read", () => {
  it("refuses a shipment naming an order, and says the same for an order that exists", async () => {
    await signIn(editor);

    // Orders are an administrator's page, and an editor may read customers. The two cases are the
    // whole property: an answer that differed between a real order id and an invented one would be an
    // oracle telling this session which rows of a table it may not read exist.
    expect(seedOrders.length).toBeGreaterThan(0);
    const real = await refused(() =>
      createResourceAction("shipments", {
        tracking: "HD-1",
        customer_id: "cus_hale",
        order_id: seedOrders[0].id,
      }),
    );
    const invented = await refused(() =>
      createResourceAction("shipments", {
        tracking: "HD-2",
        customer_id: "cus_hale",
        order_id: "ord_invented",
      }),
    );

    expect(real).toBe("denied: orders.read");
    expect(invented).toBe(real);
    // And the customer half of the same write is not what stopped it, so this is not passing because
    // the whole call was refused for some other reason.
    expect(
      await refused(() =>
        createResourceAction("shipments", { tracking: "HD-3", customer_id: "cus_hale" }),
      ),
    ).toBe("allowed");
  });

  it("does not let the refusal become a way to read which orders an id names", async () => {
    await signIn(editor);
    const read = vi.spyOn(store, "read");

    await expect(
      createResourceAction("shipments", {
        tracking: "HD-1",
        customer_id: "cus_hale",
        order_id: seedOrders[0].id,
      }),
    ).rejects.toThrow(AdminPermissionDeniedError);

    // The guard ran before the store, so a session refused orders was never asked whether the id it
    // guessed was a real one. Spied on rather than asserted on the rows afterwards, because a refusal
    // that reached the store and then refused would leave the same rows and a different answer.
    expect(read).not.toHaveBeenCalledWith("orders", seedOrders[0].id);
  });

  it("still lets the administrator write the same value, which is what makes it a rule and not a wall", async () => {
    await signIn(editor);
    expect(
      await refused(() =>
        createResourceAction("shipments", {
          tracking: "HD-EDIT",
          customer_id: "cus_hale",
          order_id: seedOrders[0].id,
        }),
      ),
    ).toBe("denied: orders.read");

    await signIn(owner);
    const created = (await createResourceAction("shipments", {
      tracking: "HD-OWNER",
      customer_id: "cus_hale",
      order_id: seedOrders[0].id,
    })) as { id: string };
    expect(created).toMatchObject({ order_id: seedOrders[0].id });
    await store.delete("shipments", created.id);
  });
});

describe("a session the demo has no part in", () => {
  it("refuses a reference check before the store is reached, like every other call", async () => {
    request.session = undefined;
    const write = vi.spyOn(store, "create");
    const read = vi.spyOn(store, "read");

    // Naming a customer nobody signed in to write a shipment for, and a session that resolves to
    // nothing. A reference cannot be a way past the session check, because it is checked by a read
    // and every read is behind the same one.
    await expect(
      createResourceAction("shipments", { tracking: "HD-1", customer_id: "cus_hale" }),
    ).rejects.toThrow(guard.RedirectSignal);

    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a resource outside the exposed set as a name, so a reference cannot be aimed at one", async () => {
    await signIn(owner);
    // `users` is behind the same persistence interface and is not exposed, so a definition pointing at
    // it would have its choices refused before the session was asked. Asked directly here because the
    // refusal has to be reachable by an attacker and the demo declares no such column.
    expect(await refused(() => queryResourceAction("users"))).toBe("not exposed: users");
  });
});

describe("the definitions the demo's own pages are built from", () => {
  it("name a target the demo's rule can be asked about, and a label the target has", async () => {
    // A reference is three names, and all three are checked here rather than at the first refused
    // write: a typo in a declaration is a mistake in the definition, and a blank cell tells its
    // author nothing about where the name came from.
    const { customersResource, shipmentsResource } = await import("../fixtures/lib/admin-resources");
    const { exposedResource } = await import("../fixtures/lib/demo-rules");
    await signIn(owner);

    for (const definition of [customersResource, shipmentsResource]) {
      for (const field of definition.fields) {
        if (field.reference === undefined) continue;
        const where = `${definition.resource}.${field.name}`;
        expect(exposedResource(field.reference.resource), where).toBe(true);
        // Every seeded row of the target carries the label, because a target row whose named label is
        // empty prints its id instead, and a column of ids is the thing this is meant to avoid.
        const rows = (await queryResourceAction(field.reference.resource)) as Array<Record<string, unknown>>;
        expect(rows.length, `${where} names a resource with no rows`).toBeGreaterThan(0);
        if (field.reference.label !== undefined) {
          for (const row of rows) {
            expect(row[field.reference.label], `${field.reference.label} on ${row.id}`).toBeDefined();
          }
        }
      }
      expect(definition.permissions?.read, `${definition.resource} has no readable permission`).toBe(
        `${definition.resource}.read`,
      );
    }
  });
});
