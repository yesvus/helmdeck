// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticate,
  createAccountAdmin,
  createCredentialAuthAdapter,
  createPersistenceCredentialStore,
  createSqlitePersistenceAdapter,
  hashPassword,
  normalizeEmail,
  type AdminSessionCookieIO,
} from "../src/baseline";
import type { AdminSession } from "../src/adapters/index";

/**
 * The account surface over the adapter a host starts on, rather than the memory one the rest of the
 * suite uses.
 *
 * The memory adapter holds typed objects and the SQLite adapter holds JSON documents, so a write
 * that reaches one of them does not prove it reaches the other. This is the adapter a host with
 * nothing installed actually has, so it is the one these properties are checked against.
 */

const PASSWORD = "correct horse battery staple";
const OWNER = "owner@example.test";
const SECRET = "a-signing-secret-long-enough-to-hold";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "helmdeck-users-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function jar() {
  let value: string | undefined;
  return {
    io: {
      read: () => value,
      write: (next: string) => {
        value = next;
      },
      clear: () => {
        value = undefined;
      },
    } satisfies AdminSessionCookieIO,
    peek: () => value,
  };
}

/** A host wired the way a starter is: a store, a sign-in, and a surface over both. */
function host() {
  const persistence = createSqlitePersistenceAdapter({
    url: `file:${join(directory, "helmdeck.db")}`,
  });
  const store = createPersistenceCredentialStore(persistence);
  const cookie = jar();
  const auth = createCredentialAuthAdapter({
    secret: SECRET,
    store,
    cookie: cookie.io,
    includeSessionId: true,
  });
  const admin = createAccountAdmin(store, {
    roles: ["admin", "editor"],
    may: {
      list: () => true,
      create: () => true,
      setRole: () => true,
      setDisabled: () => true,
      listSessions: () => true,
      endSession: () => true,
    },
  });
  return { persistence, store, cookie, auth, admin };
}

const ADMIN: AdminSession = { email: OWNER, role: "admin" };

describe("the account surface over the SQLite adapter", () => {
  it("runs the whole onboarding on a database that was empty, in the order a host would", async () => {
    const { admin, auth, persistence, store } = host();

    // Create an operator, give them a role, and see who exists.
    const created = await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD });
    expect(created).toMatchObject({ ok: true });
    const account = (created as { account: { id: string } }).account;
    expect((await admin.setRole(ADMIN, account.id, "editor"))).toMatchObject({
      ok: true,
      account: { role: "editor" },
    });
    const listed = await admin.list(ADMIN);
    expect((listed as { accounts: { email: string }[] }).accounts.map((row) => row.email)).toEqual([
      "new@example.test",
    ]);

    // They sign in, with the right password and not with a wrong one.
    expect((await auth.login({ email: "new@example.test", password: PASSWORD })).ok).toBe(true);
    expect(await authenticate(store, "new@example.test", "not-the-password")).toBeNull();

    // Take the role away. The account row has no `role` key at all rather than an empty one, because
    // an empty role is a role nobody defined and a listing should not show one.
    const taken = await admin.setRole(ADMIN, account.id, "");
    expect(taken).toMatchObject({ ok: true });
    expect(Object.keys((taken as { account: object }).account)).not.toContain("role");
    expect((await admin.list(ADMIN) as { accounts: unknown[] }).accounts).toHaveLength(1);

    // Disable them: the sign-in is refused and the live session goes with it.
    const session = await auth.getSession();
    expect(session).toMatchObject({ email: "new@example.test" });
    const disabled = await admin.setDisabled(ADMIN, account.id, true);
    expect(disabled).toMatchObject({ ok: true, ended: 1 });
    expect(await auth.getSession()).toBeNull();
    expect(await auth.login({ email: "new@example.test", password: PASSWORD })).toMatchObject({ ok: false });

    // And the row is still there, which is the difference between a flag and a delete.
    expect(await persistence.query("users", { email: "new@example.test" })).toHaveLength(1);
  });

  it("ends a session by an id taken from the list, over two browsers", async () => {
    const { admin, store, auth } = host();
    await admin.create(ADMIN, { email: OWNER, password: PASSWORD, role: "admin" });
    const desktopCookie = jar();
    const laptopCookie = jar();
    const desktop = createCredentialAuthAdapter({
      secret: SECRET,
      store,
      cookie: desktopCookie.io,
      includeSessionId: true,
    });
    const laptop = createCredentialAuthAdapter({
      secret: SECRET,
      store,
      cookie: laptopCookie.io,
      includeSessionId: true,
    });
    await desktop.login({ email: OWNER, password: PASSWORD });
    await laptop.login({ email: OWNER, password: PASSWORD });
    expect(await store.listSessions!()).toHaveLength(2);

    const caller = await desktop.getSession();
    const listed = await admin.listSessions(caller);
    const sessions = (listed as { sessions: { id: string; current: boolean; email: string }[] }).sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((row) => row.current)).toHaveLength(1);

    const target = sessions.find((row) => !row.current)!;
    expect(await admin.endSession(caller, target.id)).toEqual({ ok: true, ended: true });
    expect(await laptop.getSession()).toBeNull();
    expect(await desktop.getSession()).toMatchObject({ email: OWNER });
    expect(await admin.endSession(caller, target.id)).toEqual({ ok: true, ended: false });
    expect(auth).toBeTruthy();
  });

  it("stores an account and lets it sign in, with nothing declared in advance", async () => {
    // The same surface over a store that does not declare a role vocabulary, which is the case where
    // the package cannot know what a role is and the host's rule is the only thing that does.
    const persistence = createSqlitePersistenceAdapter({
      url: `file:${join(directory, "open.db")}`,
    });
    const store = createPersistenceCredentialStore(persistence);
    const admin = createAccountAdmin(store, { may: { create: () => true } });

    const created = await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD });

    expect(created).toMatchObject({ ok: true, account: { disabled: false } });
    expect(Object.keys((created as { account: object }).account)).not.toContain("role");
    expect(await authenticate(store, "new@example.test", PASSWORD)).toMatchObject({
      email: "new@example.test",
    });
  });

  it("keeps the hash in the row and out of every answer", async () => {
    const { admin, persistence } = host();
    await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD, role: "editor" });

    // Asserted on what the database holds, since that is the one place the hash has to be, and on
    // what comes back, since that is the one place it must not be.
    const [row] = await persistence.query<Record<string, unknown>>("users");
    expect(String(row.password_hash)).toMatch(/^scrypt\$/);
    expect(String(row.password_hash)).not.toContain(PASSWORD);
    const listed = await admin.list(ADMIN);
    expect(JSON.stringify(listed)).not.toMatch(/scrypt\$/);
    expect(await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD })).toMatchObject({
      ok: false,
    });
  });

  it("answers the sign-in the same for a disabled account as for a wrong password", async () => {
    // The two answers a form could distinguish, compared directly, because a distinct "this account
    // is off" message would report which addresses are turned off.
    const { admin, auth } = host();
    await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD, role: "editor" });
    const listed = await admin.list(ADMIN);
    const id = (listed as { accounts: { id: string }[] }).accounts[0].id;
    const wrong = await auth.login({ email: "new@example.test", password: "not-the-password" });

    await admin.setDisabled(ADMIN, id, true);
    const disabled = await auth.login({ email: "new@example.test", password: PASSWORD });

    expect(disabled).toEqual(wrong);
    // And an address with no account at all, which is the third case the form must not tell apart.
    expect(await auth.login({ email: "nobody@example.test", password: PASSWORD })).toEqual(wrong);
  });

  it("refuses every operation to a caller the policy does not permit, and writes nothing", async () => {
    const { admin, store, persistence } = host();
    const seed = await admin.create(ADMIN, { email: "new@example.test", password: PASSWORD });
    const id = (seed as { account: { id: string } }).account.id;
    // The same store with no policy at all, which is the default a host that has not thought about
    // the capability actually gets.
    const closed = createAccountAdmin(store);
    expect(persistence).toBeTruthy();

    for (const answer of [
      await closed.list({ email: OWNER, role: "editor" }),
      await closed.create({ email: OWNER, role: "editor" }, { email: "x@example.test", password: PASSWORD }),
      await closed.setRole({ email: OWNER, role: "editor" }, id, "admin"),
      await closed.setDisabled({ email: OWNER, role: "editor" }, id, true),
      await closed.listSessions({ email: OWNER, role: "editor" }),
      await closed.endSession({ email: OWNER, role: "editor" }, "any"),
    ]) {
      expect(answer).toEqual({ ok: false, message: "This account may not do that." });
    }
    // The role on the row is the one it was given, so nothing was written by any of the six.
    const listed = await admin.list(ADMIN);
    expect((listed as { accounts: { id: string; disabled: boolean }[] }).accounts[0]).toMatchObject({
      id,
      disabled: false,
    });
  });

  it("refuses a role outside the declared vocabulary, and stores a role inside it", async () => {
    const { admin } = host();

    expect(await admin.create(ADMIN, { email: "odd@example.test", password: PASSWORD, role: "sorcerer" })).toEqual({
      ok: false,
      message: 'This host has no role called "sorcerer". It has "admin", "editor".',
    });
    expect(await admin.create(ADMIN, { email: "ok@example.test", password: PASSWORD, role: "editor" })).toMatchObject({
      ok: true,
      account: { role: "editor" },
    });
  });

  it("normalises the address it writes, so a later sign-in finds the row", async () => {
    const { admin, auth } = host();
    await admin.create(ADMIN, { email: "  New@Example.Test ", password: PASSWORD, role: "editor" });

    expect((await auth.login({ email: "new@example.test", password: PASSWORD })).ok).toBe(true);
    expect(await admin.create(ADMIN, { email: "NEW@EXAMPLE.TEST", password: PASSWORD })).toMatchObject({
      ok: false,
    });
    expect(normalizeEmail(" New@Example.Test ")).toBe("new@example.test");
    expect(await hashPassword(PASSWORD)).toMatch(/^scrypt\$/);
  });
}, 60_000);
