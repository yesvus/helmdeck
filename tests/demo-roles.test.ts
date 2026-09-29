// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { demoCan } from "../fixtures/lib/demo-rules";
import { seedOrders } from "../fixtures/lib/seed-data";
import { checkPermissionAction } from "../fixtures/lib/permission-actions";
import {
  createResourceAction,
  deleteResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "../fixtures/lib/resource-actions";
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";

/**
 * What the role on the stored user row is worth, checked at the server action rather than at the
 * view.
 *
 * A hidden button is not authorization, so nothing here renders a page. Every call goes through the
 * same exported action a browser would post to, with the session the signed cookie resolves to and
 * nothing else, which is the call an attacker makes when the button is missing. A test that read the
 * rendered page would pass against a demo whose actions were wide open.
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
  expect(result.ok).toBe(true);
  return request.session;
}

beforeEach(async () => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. The actions are server code, so they run without it.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  // Seeded rather than assumed: the roles under test are rows, and a store nothing has written to
  // would leave every test proving that a missing role may do nothing.
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  for (const account of demoAccounts) {
    await store.update("users", account.id, { role: account.role });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the rule hands each account", () => {
  const admin: AdminSession = { email: owner.email, role: "admin" };
  const asEditor: AdminSession = { email: editor.email, role: "editor" };

  it("gives the administrator everything and the editor content without the deletions", () => {
    // The split is the demo's: an editor works the catalogue, an administrator also decides what
    // happens to a record and sees the money. Nav already hides orders from an editor.
    expect(demoCan(admin, "products.read")).toBe(true);
    expect(demoCan(admin, "products.create")).toBe(true);
    expect(demoCan(admin, "products.update")).toBe(true);
    expect(demoCan(admin, "products.delete")).toBe(true);
    expect(demoCan(admin, "orders.read")).toBe(true);
    expect(demoCan(admin, "orders.delete")).toBe(true);

    expect(demoCan(asEditor, "products.read")).toBe(true);
    expect(demoCan(asEditor, "products.create")).toBe(true);
    expect(demoCan(asEditor, "products.update")).toBe(true);
    // The two differences a visitor can see: no delete on a row, and no orders at all.
    expect(demoCan(asEditor, "products.delete")).toBe(false);
    expect(demoCan(asEditor, "orders.read")).toBe(false);
    expect(demoCan(asEditor, "orders.update")).toBe(false);
  });

  it("refuses every permission to a session with no role, or a role it has never heard of", () => {
    // A role column nobody checked, a migration that added one, a row written by a tool that did not
    // know the rule: none of them is a grant. The permissive answer here is how a typo in a string
    // becomes an administrator.
    const permissions: AdminPermission[] = [
      "products.read",
      "products.create",
      "products.update",
      "products.delete",
      "orders.read",
      "orders.delete",
    ];

    for (const session of [
      { email: owner.email },
      { email: owner.email, role: "" },
      { email: owner.email, role: "superuser" },
      { email: owner.email, role: "Admin" },
      { email: owner.email, role: " admin" },
      // Names an object would answer for. A Map keys on what was granted and nothing else.
      { email: owner.email, role: "constructor" },
      { email: owner.email, role: "toString" },
      { email: owner.email, role: "__proto__" },
    ] satisfies AdminSession[]) {
      expect(permissions.map((permission) => demoCan(session, permission)), session.role).toEqual(
        permissions.map(() => false),
      );
    }
  });

  it("answers about the resource before the first dot, and nothing else", () => {
    expect(demoCan(admin, "products")).toBe(false);
    expect(demoCan(admin, "products.read.write")).toBe(false);
    expect(demoCan(admin, "users.read")).toBe(false);
    expect(demoCan(asEditor, "orders.read")).toBe(false);
  });
});

describe("what the server actions serve", () => {
  it("serves an editor its catalogue and refuses the same editor the orders", async () => {
    await signIn(editor);

    const products = await queryResourceAction("products");
    expect(products.length).toBeGreaterThan(0);

    await expect(queryResourceAction("orders")).rejects.toThrow(/may not read orders/);
  });

  it("refuses an editor the delete the administrator is given", async () => {
    // The call an attacker makes: no page renders this button for an editor, and the action answers
    // from the role on the row rather than from whether a button was drawn.
    await signIn(editor);

    await expect(deleteResourceAction("products", "prd_1")).rejects.toThrow(/may not delete products/);

    // Refused before anything was written, so the record is untouched rather than half deleted.
    expect(await readResourceAction("products", "prd_1")).not.toBeNull();
  });

  it("still serves an editor the work it is allowed, so the rule is a split and not a wall", async () => {
    await signIn(editor);

    const created = (await createResourceAction("products", {
      id: "prd_editor",
      name: "Editor made this",
      sku: "EDIT-001",
      price_cents: 1200,
      stock: 2,
    })) as { id: string };
    expect(created.id).toBe("prd_editor");

    await updateResourceAction("products", created.id, { price_cents: 1500 });
    expect(await readResourceAction("products", created.id)).toMatchObject({ price_cents: 1500 });

    // Removed again, because the store is shared with the rest of the file.
    await store.delete("products", created.id);
  });

  it("performs the administrator's delete, which the same call refused for the editor", async () => {
    await signIn(owner);
    const before = (await readResourceAction("products", "prd_1")) as { id: string };

    await deleteResourceAction("products", before.id);

    expect(await readResourceAction("products", before.id)).toBeNull();
    await createResourceAction("products", before);
  });

  it("refuses a session when the role on the row is one the rule does not define", async () => {
    await signIn(editor);
    await store.update("users", editor.id, { role: "superuser" });

    await expect(queryResourceAction("products")).rejects.toThrow(/may not read products/);
    await expect(createResourceAction("products", { name: "x" })).rejects.toThrow(
      /may not create products/,
    );
  });

  it("refuses a session whose stored role is not a role string", async () => {
    await signIn(editor);
    // A NULL or a number in a column that is supposed to hold one of two words is a missing grant,
    // and is read as one rather than as a session that may do anything.
    await store.update("users", editor.id, { role: null });

    await expect(queryResourceAction("products")).rejects.toThrow(/may not read products/);
  });

  it("refuses everyone when nobody is signed in, whatever the resource", async () => {
    request.session = undefined;

    await expect(queryResourceAction("products")).rejects.toThrow(guard.RedirectSignal);
    await expect(queryResourceAction("orders")).rejects.toThrow(guard.RedirectSignal);
    await expect(deleteResourceAction("products", "prd_1")).rejects.toThrow(guard.RedirectSignal);
    await expect(queryResourceAction("users")).rejects.toThrow(/not a resource this admin exposes/);
  });
});

describe("the role a session acts as", () => {
  it("changes when the stored row changes, on the very next call", async () => {
    // The row is the source. An editor promoted in the database keeps the session they signed in
    // with, and that session immediately reaches what the administrator reaches.
    const sealed = await signIn(editor);

    await expect(queryResourceAction("orders")).rejects.toThrow(/may not read orders/);

    await store.update("users", editor.id, { role: "admin" });
    expect(await queryResourceAction("orders")).toHaveLength(seedOrders.length);

    await store.update("users", editor.id, { role: "editor" });
    await expect(queryResourceAction("orders")).rejects.toThrow(/may not read orders/);
    expect(request.session).toBe(sealed);
  });

  it("is not in the cookie, and a cookie cannot claim one", async () => {
    const sealed = await signIn(editor);

    // The sealed value names a session and nothing else. There is no role in it to edit, and the
    // signature covers the whole of what there is.
    expect(sealed!.split(".")).toHaveLength(2);
    expect(sealed).not.toContain("editor");
    expect(sealed).not.toContain("admin");

    request.session = `${sealed}.admin`;
    await expect(queryResourceAction("products")).rejects.toThrow(guard.RedirectSignal);

    // A forged id is refused by the signature before any row is looked at, so it cannot even be used
    // to ask which session ids exist.
    request.session = "ses_not_issued.not-a-signature";
    await expect(queryResourceAction("products")).rejects.toThrow(guard.RedirectSignal);
    await expect(queryResourceAction("orders")).rejects.toThrow(guard.RedirectSignal);
  });

  it("answers the views exactly what it serves the actions", async () => {
    // The two halves must not drift: the button that is not rendered and the action that is refused
    // are the same answer to the same question, and both come from the role on the row.
    await signIn(editor);
    expect(await checkPermissionAction("products.read")).toBe(true);
    expect(await checkPermissionAction("products.update")).toBe(true);
    expect(await checkPermissionAction("products.delete")).toBe(false);
    expect(await checkPermissionAction("orders.read")).toBe(false);
    await expect(deleteResourceAction("products", "prd_1")).rejects.toThrow();

    await signIn(owner);
    expect(await checkPermissionAction("products.delete")).toBe(true);
    expect(await checkPermissionAction("orders.read")).toBe(true);
    expect(await checkPermissionAction("users.read")).toBe(false);
  });
});
