// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { demoCan } from "../fixtures/lib/demo-rules";
import { seedDemo } from "../fixtures/lib/seed";
import { seedOrders } from "../fixtures/lib/seed-data";
import { hashPassword, verifyPassword } from "@yesvus/helmdeck/baseline";
import { createTursoPersistenceAdapter, resetTursoAdapterCache, type SqlClient } from "../fixtures/lib/turso-persistence";
import { checkPermissionAction } from "../fixtures/lib/permission-actions";
import {
  createResourceAction,
  deleteResourceAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "../fixtures/lib/resource-actions";
import {
  evaluateAdminPermission,
  AdminPermissionDeniedError,
  AdminResourceNotExposedError,
  type AdminPermission,
  type AdminSession,
} from "@yesvus/helmdeck";

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

/**
 * One hash for the whole file, because scrypt is deliberately slow and the published password is the
 * same one every account is seeded with.
 */
let published: Promise<string> | null = null;
const publishedHash = () => (published ??= hashPassword(DEMO_PASSWORD));

/**
 * The role on the stored row, and nothing else about it.
 *
 * An update replaces the row rather than merging into it, so writing the role alone would leave an
 * account with no address and no hash, which a sign-in answers exactly as it answers an address
 * nobody has. The rest of the row is carried through for that reason: what these tests change is the
 * role, and the account has to remain an account somebody can sign in to.
 */
async function setRole(account: { id: string }, role: unknown) {
  const row = (await store.read("users", account.id)) as Record<string, unknown>;
  await store.update("users", account.id, { ...row, role });
}

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
  // would leave every test proving that a missing role may do nothing. The accounts are then written
  // whole, because a test that changed a role rewrote the row and the next test needs an account
  // again, which is the cost of the account being a row rather than a value in an array.
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  const hash = await publishedHash();
  for (const account of demoAccounts) {
    await store.update("users", account.id, {
      id: account.id,
      email: account.email,
      role: account.role,
      password_hash: hash,
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what the rule hands each account", () => {
  const admin: AdminSession = { email: owner.email, role: "admin" };
  const asEditor: AdminSession = { email: editor.email, role: "editor" };

  // The rule is the demo's, the decision is the package's: these ask through the same evaluation the
  // guard and the check run, so what is asserted here is what the server would answer rather than
  // what a function returns on its own.
  const decided = (session: AdminSession, permission: AdminPermission) =>
    evaluateAdminPermission({ rule: demoCan, session, permission });

  it("gives the administrator everything and the editor content without the deletions", async () => {
    // The split is the demo's: an editor works the catalogue, an administrator also decides what
    // happens to a record and sees the money. Nav already hides orders from an editor.
    expect(await decided(admin, "products.read")).toBe(true);
    expect(await decided(admin, "products.create")).toBe(true);
    expect(await decided(admin, "products.update")).toBe(true);
    expect(await decided(admin, "products.delete")).toBe(true);
    expect(await decided(admin, "orders.read")).toBe(true);
    expect(await decided(admin, "orders.delete")).toBe(true);

    expect(await decided(asEditor, "products.read")).toBe(true);
    expect(await decided(asEditor, "products.create")).toBe(true);
    expect(await decided(asEditor, "products.update")).toBe(true);
    // The two differences a visitor can see: no delete on a row, and no orders at all.
    expect(await decided(asEditor, "products.delete")).toBe(false);
    expect(await decided(asEditor, "orders.read")).toBe(false);
    expect(await decided(asEditor, "orders.update")).toBe(false);
  });

  it("refuses every permission to a session with no role, or a role it has never heard of", async () => {
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
      expect(
        await Promise.all(permissions.map((permission) => decided(session, permission))),
        session.role,
      ).toEqual(permissions.map(() => false));
    }
  });

  it("answers about the resource before the first dot, and nothing else", async () => {
    expect(await decided(admin, "products" as AdminPermission)).toBe(false);
    expect(await decided(admin, "products.read.write" as AdminPermission)).toBe(false);
    expect(await decided(admin, "users.read")).toBe(false);
    expect(await decided(asEditor, "orders.read")).toBe(false);
  });
});

describe("what the server actions serve", () => {
  // A refusal here is the package's guard refusing, so the class is what says it ran on the server
  // rather than in a view. Its message names the permission the rule was asked, which is the same
  // fact the previous wording gave as "may not read orders": the decision is unchanged, and the
  // refusal is the package's own type now.
  it("serves an editor its catalogue and refuses the same editor the orders", async () => {
    await signIn(editor);

    const products = await queryResourceAction("products");
    expect(products.length).toBeGreaterThan(0);

    await expect(queryResourceAction("orders")).rejects.toThrow(AdminPermissionDeniedError);
  });

  it("refuses an editor the delete the administrator is given", async () => {
    // The call an attacker makes: no page renders this button for an editor, and the action answers
    // from the role on the row rather than from whether a button was drawn.
    await signIn(editor);

    await expect(deleteResourceAction("products", "prd_1")).rejects.toThrow(AdminPermissionDeniedError);

    // Refused before anything was written, so the record is untouched rather than half deleted.
    expect(await readResourceAction("products", "prd_1")).not.toBeNull();
  });

  it("names the permission it refused, so the refusal says which question was asked", async () => {
    await signIn(editor);

    // The permission verbatim. A message naming the operation alone would leave the resource out of
    // the sentence, which is half of what a caller needs to know.
    await expect(queryResourceAction("orders")).rejects.toThrow("This session may not orders.read");
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
    // The adapter still honours a supplied id, and the seed depends on it. The action boundary does
    // not, and that is a policy rather than a limitation: `id` is the record's identity rather than
    // one of its fields, so a browser that could choose it could name a record that already exists.
    // This assertion used to expect "prd_editor" and was changed deliberately, not to make a change
    // pass but because the contract is the other way round and the test was the wrong side of it.
    expect(created.id).not.toBe("prd_editor");
    expect(typeof created.id).toBe("string");
    expect(created.id.length).toBeGreaterThan(0);

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
    await setRole(editor, "superuser");

    await expect(queryResourceAction("products")).rejects.toThrow(AdminPermissionDeniedError);
    await expect(createResourceAction("products", { name: "x" })).rejects.toThrow(
      AdminPermissionDeniedError,
    );
  });

  it("refuses a session whose stored role is not a role string", async () => {
    await signIn(editor);
    // A NULL or a number in a column that is supposed to hold one of two words is a missing grant,
    // and is read as one rather than as a session that may do anything.
    await setRole(editor, null);

    await expect(queryResourceAction("products")).rejects.toThrow(AdminPermissionDeniedError);
  });

  it("refuses everyone when nobody is signed in, whatever the resource", async () => {
    request.session = undefined;
    // Spied on before the call rather than asserted on the rows afterwards: a refusal that reached
    // the store and then refused would leave the same rows and a different answer to whether it ran.
    const read = vi.spyOn(store, "query");
    const written = vi.spyOn(store, "delete");

    await expect(queryResourceAction("products")).rejects.toThrow(guard.RedirectSignal);
    await expect(queryResourceAction("orders")).rejects.toThrow(guard.RedirectSignal);
    await expect(deleteResourceAction("products", "prd_1")).rejects.toThrow(guard.RedirectSignal);
    // A name outside the exposed set is refused as a name, which is a different question from the
    // session's, and answering it does not need a session to answer about.
    await expect(queryResourceAction("users")).rejects.toThrow(AdminResourceNotExposedError);

    expect(read).not.toHaveBeenCalled();
    expect(written).not.toHaveBeenCalled();
  });
});

describe("the role a session acts as", () => {
  it("changes when the stored row changes, on the very next call", async () => {
    // The row is the source. An editor promoted in the database keeps the session they signed in
    // with, and that session immediately reaches what the administrator reaches.
    const sealed = await signIn(editor);

    await expect(queryResourceAction("orders")).rejects.toThrow(AdminPermissionDeniedError);

    await setRole(editor, "admin");
    expect(await queryResourceAction("orders")).toHaveLength(seedOrders.length);

    await setRole(editor, "editor");
    await expect(queryResourceAction("orders")).rejects.toThrow(AdminPermissionDeniedError);
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

  it("ends a session whose expiry is not a number instead of reading it as valid", async () => {
    // `NaN <= now` is false, so the comparison on its own treats an unparseable expiry as a session
    // that has not lapsed. Nothing this store writes produces one, which is the point: a row that did
    // not come from here must not read as a valid session, and a session whose expiry cannot be judged
    // is ended rather than kept.
    const sealed = await signIn(owner);
    const id = sealed!.split(".")[0];
    const row = await store.read<{ id: string; expires_at: unknown }>("sessions", id);
    await store.update("sessions", id, { ...(row as object), expires_at: "not-a-number" });

    await expect(queryResourceAction("products")).rejects.toThrow(guard.RedirectSignal);
    expect(await store.read("sessions", id)).toBeNull();
  });

  it("fills in the password hashes a migration cannot know, on a database migrated from empty", async () => {
    // `0003_roles.sql` inserts both accounts with an empty `password_hash`, because a migration has no
    // hash to put in it and a hash in a migration is a hash in the repository. That only works if the
    // seed then finds the rows it just created and fills them in rather than skipping them as already
    // present, which is not visible from the migration's diff and was the reason this was checked.
    const dir = mkdtempSync(join(tmpdir(), "helmdeck-fresh-"));
    const url = `file:${join(dir, "demo.db")}`;
    const client = createClient({ url });
    try {
      for (const name of readdirSync(join(process.cwd(), "fixtures/lib/migrations")).sort()) {
        // executeMultiple, not execute: a migration file is a script, and execute runs the first
        // statement of it, which is the PRAGMA and nothing else.
        await client.executeMultiple(
          readFileSync(join(process.cwd(), "fixtures/lib/migrations", name), "utf8"),
        );
      }
      resetTursoAdapterCache();
      // The same bridge demo-persistence.ts uses for the real driver: `SqlClient` is a narrow
      // structural type and the driver's `execute` is overloaded, so the two do not line up without
      // a cast even though the runtime shape is what the adapter asks for.
      const fresh = createTursoPersistenceAdapter(client as unknown as SqlClient);

      const afterMigration = await fresh.query<{ id: string; password_hash: string }>("users");
      expect(afterMigration.map((row) => row.id).sort()).toEqual(["usr_editor", "usr_owner"]);
      expect(afterMigration.every((row) => row.password_hash === "")).toBe(true);

      await seedDemo(fresh as never, DEMO_PASSWORD);

      const afterSeed = await fresh.query<{ id: string; role: string; password_hash: string }>("users");
      expect(afterSeed).toHaveLength(2);
      for (const row of afterSeed) {
        expect(row.password_hash, `${row.id} hash`).not.toBe("");
        // A hash in a stored column is not what login checks, so this is the only thing that would
        // notice the column going stale, which is why it is asserted rather than assumed.
        expect(await verifyPassword(DEMO_PASSWORD, row.password_hash)).toBe(true);
      }
      expect(afterSeed.find((row) => row.id === "usr_owner")?.role).toBe("admin");
      expect(afterSeed.find((row) => row.id === "usr_editor")?.role).toBe("editor");
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
