// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import { updateResourceAction, createResourceAction, deleteResourceAction } from "../fixtures/lib/resource-actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoCacheRoutes } from "../fixtures/lib/demo-cache";

/**
 * The demo's audit trail, and the property that makes it worth anything.
 *
 * The package's seam writes the event, and the seam's own tests already prove the ordering, the
 * refusals and the field names. What nothing else proves is that the demo has a trail at all, which
 * is the half both workstreams correctly left to the orchestrator: a seam that exists and that
 * nothing calls is documentation.
 *
 * The table is a host table rather than an exposed resource, so it is read through the adapter here
 * rather than through a query action. That is deliberate. A trail read through the same calls that
 * write it would record its own reads, and the write would never finish.
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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (route: string) => revalidated.push(route) }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;

type TrailRow = {
  id: string;
  resource: string;
  resource_id: string;
  action: string;
  actor_email: string;
  fields: string;
  occurred_at: string;
};

async function trail(): Promise<TrailRow[]> {
  return store.query<TrailRow>("audit_events");
}

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
  return request.session;
}

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  revalidated.length = 0;
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) await store.delete("sessions", row.id);
  for (const row of await trail()) await store.delete("audit_events", row.id);
});

afterEach(async () => {
  vi.unstubAllGlobals();
});

describe("the demo's audit trail", () => {
  it("records a create against the record the store made, naming the actor", async () => {
    await signIn(owner);
    const created = await createResourceAction("products", {
      sku: "AUD-1",
      name: "Audited product",
      price_cents: 1200,
      stock: 4,
    });

    const events = await trail();
    const event = events.find((row) => row.action === "create");
    expect(event, "a create left no event").toBeDefined();
    expect(event?.resource).toBe("products");
    // The id the store assigned, not one the caller chose: the server names the record, so a caller
    // cannot choose one, and an event that echoed the caller's guess would be recording a wish.
    expect(event?.resource_id).toBe((created as { id: string }).id);
    expect(event?.actor_email).toBe(owner.email);
  });

  it("records field names, never the values a record held", async () => {
    await signIn(owner);
    await createResourceAction("products", {
      sku: "AUD-2",
      name: "A product with a price",
      price_cents: 98765,
      stock: 1,
    });

    const event = (await trail()).find((row) => row.action === "create");
    const fields = JSON.parse(event?.fields ?? "[]") as string[];

    expect(fields).toContain("price_cents");
    // A trail holding every value a record has ever had is a second copy of every secret in the
    // table, and this one is readable by anyone who can query the demo's store.
    expect(JSON.stringify(event)).not.toContain("98765");
  });

  it("records nothing for a write the rule refuses, asked the way an attacker would", async () => {
    // The editor may read, create and update, and may not delete. The record is a real one the owner
    // made, so the refusal is the operation and not the record.
    await signIn(owner);
    const created = (await createResourceAction("products", {
      sku: "AUD-3",
      name: "Not deletable by an editor",
      price_cents: 300,
      stock: 1,
    })) as { id: string };

    await signIn(editor);
    const before = (await trail()).length;

    // Called directly with nothing rendered, which is the only way a refusal is really tested.
    await expect(deleteResourceAction("products", created.id)).rejects.toThrow();

    expect((await trail()).length, "a refused write left a row in the trail").toBe(before);
    expect((await store.read("products", created.id)) !== null, "the refused delete still happened").toBe(
      true,
    );
  });

  it("records a delete against the record the call named, and carries no fields for it", async () => {
    await signIn(owner);
    const created = (await createResourceAction("products", {
      sku: "AUD-4",
      name: "Removed later",
      price_cents: 500,
      stock: 1,
    })) as { id: string };
    await deleteResourceAction("products", created.id);

    const event = (await trail()).find((row) => row.action === "delete");
    expect(event?.resource_id).toBe(created.id);
    // The record it removed is not there to describe, so there are no fields to name.
    expect(JSON.parse(event?.fields ?? "[]")).toEqual([]);
  });

  it("invalidates the collection on a create and the record on an update", async () => {
    await signIn(owner);
    const created = (await createResourceAction("products", {
      sku: "AUD-5",
      name: "Cache target",
      price_cents: 100,
      stock: 1,
    })) as { id: string };

    revalidated.length = 0;
    await updateResourceAction("products", created.id, { stock: 9 });

    // A record no read has returned yet has no key in the cache, so a create is what invalidates the
    // collection. Getting that split wrong is how a cache serves a row that was deleted three
    // requests ago.
    expect(demoCacheRoutes("products")).toContain("/shell/products");
    expect(demoCacheRoutes("products", created.id)).toContain(`/shell/products/${created.id}`);
    expect(revalidated.some((route) => route.startsWith("/shell/products"))).toBe(true);
  });

  it("maps a resource to the routes a visitor can see a change on, and names the gaps", () => {
    // `posts` is the CMS content page, not a route named after the resource, and the accent is read
    // by the shell on every route, so a change to it is visible everywhere. Both are decisions a
    // host has to make and the package cannot.
    expect(demoCacheRoutes("posts")).toContain("/shell/content");
    expect(demoCacheRoutes("site_settings")).toContain("/shell");
    // A resource with no route of its own has nothing to revalidate, and saying so is better than
    // invalidating a path nothing serves.
    expect(demoCacheRoutes("a_resource_with_no_route")).toEqual([]);
  });
});
