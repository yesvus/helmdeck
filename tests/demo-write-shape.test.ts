// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { createResourceAction, updateResourceAction } from "../fixtures/lib/resource-actions";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";

// The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom is
// one. The actions are server code, so they run without it. The owner does not matter here: what is
// under test is the shape of what a write carries, and the owner can do everything, which keeps the
// session plumbing out of the assertions.
const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

// The guard answers a missing session with a redirect, so a session has to be established before
// these tests can reach a write. The cookie is captured out of the `set` the sign-in performs, which
// is what a browser would carry, and the redirect is a signal so a refusal is an assertion rather
// than a crash.
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
  permanentRedirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * A write must carry only the fields the definition declares.
 *
 * The generated forms already did this, because `adminResourceValues` is what they call. The actions
 * did not: they handed their `value` straight to the adapter, so the claim that a field removed from
 * the definition cannot be smuggled back in through a hand-edited request was true of the form and
 * false of the boundary. The column check in the persistence layer is not a substitute, because it
 * asks whether a name is a column of the table, and `id`, `created_at` and `updated_at` all are.
 *
 * These are the tests that say so. They are the ones that would have caught it, since every other
 * test in this area goes through the form.
 */
describe("what a write is allowed to carry", () => {
  const [owner] = demoAccounts;

  beforeEach(async () => {
    vi.stubGlobal("window", undefined);
    request.session = undefined;
    await ensureDemoSeeded();
    const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, "");
    expect(result.ok).toBe(true);
  });

  afterEach(() => {
    request.session = undefined;
  });

  it("refuses a column the table has but the definition does not declare", async () => {
    await ensureDemoSeeded();
    const store = demoPersistence().adapter;

    // Refused rather than dropped. This used to narrow the write in the demo's own adapter, so the
    // demo was protected and the shipped boundary was not, and this test was asserting the demo's
    // copy rather than the package. A dropped column leaves the author believing it was written,
    // which is the same defect pointed the other way.
    await expect(
      createResourceAction("products", {
        name: "Declared only",
        sku: "DECL-001",
        price_cents: 500,
        stock: 1,
        created_at: "1999-01-01 00:00:00",
      }),
    ).rejects.toThrow(/created_at/);

    // A caller-supplied timestamp would otherwise be written, so the record would claim to be older
    // than it is. This is the shape of the bug: an accepted column, a value nobody chose.
    expect(await store.read("products", "prd_1")).toMatchObject({ name: expect.any(String) });
  });

  it("names the record itself rather than letting the caller choose the id", async () => {
    await ensureDemoSeeded();
    const store = demoPersistence().adapter;

    const created = (await createResourceAction("products", {
      id: "prd_caller_named_this",
      name: "Server named this",
      sku: "NAME-001",
      price_cents: 500,
      stock: 1,
    })) as { id: string };

    expect(created.id).not.toBe("prd_caller_named_this");
    // The record the caller tried to name is untouched, which is the part that matters: a caller
    // choosing an id could otherwise write over a row that already exists.
    expect(await store.read("products", "prd_caller_named_this")).toBeNull();
  });

  it("refuses an undeclared field through an update too", async () => {
    await ensureDemoSeeded();
    const store = demoPersistence().adapter;
    const before = (await store.read("products", "prd_1")) as { name: string };

    await expect(
      updateResourceAction("products", "prd_1", { name: "Renamed", updated_at: "1999-01-01 00:00:00" }),
    ).rejects.toThrow(/updated_at/);

    // Nothing was written, so the record still holds what it held. A refusal that left a partial
    // write behind would be worse than no refusal at all.
    const after = (await store.read("products", "prd_1")) as { name: string; updated_at?: string };
    expect(after.name).toBe(before.name);
    expect(after.updated_at).not.toBe("1999-01-01 00:00:00");
  });
});
