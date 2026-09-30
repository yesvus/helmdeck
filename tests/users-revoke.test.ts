// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  createAccountAdmin,
  createCredentialAuthAdapter,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  type AdminSessionCookieIO,
  type CredentialStore,
} from "../src/baseline";
import type { AdminSession } from "../src/adapters/index";
import { createAdminPermissionCheck, createAdminPermissionGuard } from "../src/index";

/**
 * What a disable actually does, measured rather than argued, and the two moments it does not reach.
 *
 * A review found that a disable could report success while leaving sessions usable. It could not: the
 * read path refuses a disabled account on every read and deletes the row with the refusal, and this
 * file holds the measurement. What it found instead, once measured, was that the two halves of a
 * disable could be left in a bad order by a failure, and that the count was the store's claim rather
 * than a fact about the store. Both are fixed here.
 *
 * The last two tests pin the limit a read-path check cannot reach, because it is a real one and a
 * README paragraph is not a test.
 */

const PASSWORD = "correct horse battery staple";
const ADDRESS = "victim@example.test";
const SECRET = "a-signing-secret-long-enough-to-hold";
const ADMIN: AdminSession = { email: "owner@example.test", role: "admin" };

function jar(initial?: string) {
  let value = initial;
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

/** A store over memory, an account in it with a role, and a surface allowed to disable. */
function world() {
  const db = createMemoryPersistenceAdapter();
  const store = createPersistenceCredentialStore(db);
  const admin = createAccountAdmin(store, {
    roles: ["admin", "editor"],
    may: { create: () => true, setDisabled: () => true, list: () => true },
  });
  return { db, store, admin };
}

async function withAnAccount() {
  const app = world();
  await app.admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });
  const id = (await app.admin.list(ADMIN) as { accounts: { id: string }[] }).accounts[0].id;
  return { ...app, id };
}

const inAWhile = Math.floor(Date.now() / 1000) + 600;

describe("what a disable does to the sessions it finds", () => {
  it("refuses a fresh read of the session, the sign-in, and a replayed cookie", async () => {
    const { store, admin, id, db } = await withAnAccount();
    const cookie = jar();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });
    await auth.login({ email: ADDRESS, password: PASSWORD });
    expect(await auth.getSession()).toMatchObject({ email: ADDRESS, role: "editor" });

    expect(await admin.setDisabled(ADMIN, id, true)).toMatchObject({ ok: true, ended: 1 });

    // The three answers a person with a browser can get, and none of them is a session.
    expect(await auth.getSession()).toBeNull();
    expect((await auth.login({ email: ADDRESS, password: PASSWORD })).ok).toBe(false);
    // The cookie is still in the jar, so this is a replay rather than a missing one, and a brand new
    // adapter verifies the same signature the old one issued.
    const replay = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar(cookie.peek()!).io });
    expect(await replay.getSession()).toBeNull();
    expect(await db.query("sessions")).toEqual([]);
  });

  it("ends the sessions before it turns the account off, so a failure leaves the account on", async () => {
    // The order is the fix. Ending the account first and the sessions second means a store that
    // cannot delete leaves an account that is off with a live session and a caller holding an
    // exception, so the person is still signed in and nobody was told.
    const { store, id, db } = await withAnAccount();
    await store.createSession(id, inAWhile);
    const boom = new Error("the session table is gone");
    const broken: CredentialStore = { ...store, deleteSessionsForUser: () => Promise.reject(boom) };
    const overBroken = createAccountAdmin(broken, { may: { setDisabled: () => true } });

    // The failure is not swallowed: a host whose store is broken has to see that it is broken.
    await expect(overBroken.setDisabled(ADMIN, id, true)).rejects.toThrow(boom);

    // And what it left is the state the caller asked to change away from, so a retry repeats the
    // attempt rather than compounding a partial one.
    expect((await store.findUserById(id))?.disabled).toBeUndefined();
    expect(await db.query("sessions")).toHaveLength(1);
    // The account still works, because it was never turned off.
    expect(await store.findUserByEmail(ADDRESS)).toMatchObject({ role: "editor" });
  });

  it("refuses a disable whose sessions survived, rather than reporting a count it cannot vouch for", async () => {
    // A store that reports a number it did not check. Believing it puts a "done" in an admin screen
    // for a person who is still signed in, which is the shape of defect a count must not be.
    const { store, id, db } = await withAnAccount();
    await store.createSession(id, inAWhile);
    const liar: CredentialStore = { ...store, deleteSessionsForUser: async () => 7 };
    const overLiar = createAccountAdmin(liar, { may: { setDisabled: () => true } });

    const answer = await overLiar.setDisabled(ADMIN, id, true);

    expect(answer).toEqual({
      ok: false,
      reason: "sessions-survived",
      message: "The account is off, but 1 of its sessions could not be ended. They are refused on the next request, and the rows are still there.",
    });
    // The account is off, which is what was asked for and what the reason is not denying.
    expect((await store.findUserById(id))?.disabled).toBe(true);
    expect(await db.query("sessions")).toHaveLength(1);
  });

  it("counts what it ended rather than what the store claimed", async () => {
    const { store, id } = await withAnAccount();
    await store.createSession(id, inAWhile);
    await store.createSession(id, inAWhile);
    // Deletes what it is asked to and reports a number that is not it.
    const padded: CredentialStore = {
      ...store,
      deleteSessionsForUser: async (userId) => {
        await store.deleteSessionsForUser(userId);
        return 99;
      },
    };
    const overPadded = createAccountAdmin(padded, { may: { setDisabled: () => true } });

    // Two went and the answer says two, because that is what was measured on either side of the
    // delete rather than what the store said about itself.
    expect(await overPadded.setDisabled(ADMIN, id, true)).toMatchObject({ ok: true, ended: 2 });
  });

  it("answers a null count rather than a number when the store cannot list its sessions", async () => {
    // The honest gap: a store with no `listSessions` cannot be checked from here, and a number it
    // volunteered is still only its claim. Null says that, and a number would not.
    const { store, id } = await withAnAccount();
    const sparse: CredentialStore = {
      ...store,
      listSessions: undefined,
      deleteSessionsForUser: async () => 4,
    };
    const overSparse = createAccountAdmin(sparse, { may: { setDisabled: () => true } });

    expect(await overSparse.setDisabled(ADMIN, id, true)).toMatchObject({ ok: true, ended: null });
  });

  it("ends nothing when the account is turned back on, and says so with a zero", async () => {
    const { store, admin, id } = await withAnAccount();
    await store.createSession(id, inAWhile);
    const cookie = jar();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });
    await auth.login({ email: ADDRESS, password: PASSWORD });

    await admin.setDisabled(ADMIN, id, true);
    // The sessions are gone because of the disable, so this proves the re-enable did not end them
    // rather than the number being the thing under test.
    const enabled = await admin.setDisabled(ADMIN, id, false);

    expect(enabled).toMatchObject({ ok: true, ended: 0, account: { disabled: false } });
    expect((await auth.login({ email: ADDRESS, password: PASSWORD })).ok).toBe(true);
  });
});

/**
 * The limit, pinned.
 *
 * A resolved session is a claim about a moment. Two places hold one past the moment: a server action
 * that resolved it at the top of its request, and the browser provider, which keeps one until the
 * host calls `refresh`. Neither keeps a credential working, because the next read goes through the
 * store and the store refuses. Both are worth stating rather than leaving a read-path check looking
 * total, which is what the README says and what these two tests are the evidence for.
 */
describe("what a disable does not reach", () => {
  it("a session object resolved before the disable still satisfies a guard built over it", async () => {
    const { store, admin, id } = await withAnAccount();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar().io });
    await auth.login({ email: ADDRESS, password: PASSWORD });

    // What a server action does at the top of a request: read the session, then use the value.
    const resolved = await auth.getSession();
    await admin.setDisabled(ADMIN, id, true);

    const guard = createAdminPermissionGuard({ rule: () => true, session: () => resolved });
    const check = createAdminPermissionCheck({ rule: () => true, session: () => resolved });

    // Granted, because the object says the account is signed in and the rule was asked about the
    // object rather than about the store. The rule here is a stub, so what is being shown is that
    // nothing in this path re-reads anything.
    expect(await guard("products.read")).toBe(resolved);
    expect(await check("products.read")).toBe(true);
    // And the store is the thing that answers, on the next read.
    expect(await auth.getSession()).toBeNull();
  });

  it("a fresh resolve is refused, so the window is the holder's and not the session's", async () => {
    const { store, admin, id } = await withAnAccount();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar().io });
    await auth.login({ email: ADDRESS, password: PASSWORD });
    await admin.setDisabled(ADMIN, id, true);

    // A guard that resolves per call, which is the wiring the README asks for, sees nothing.
    const resolve = () => auth.getSession();
    const guard = createAdminPermissionGuard({ rule: () => true, session: resolve });

    // Refused for want of a session rather than by the rule, which is the same answer the store gives.
    await expect(guard("products.read")).rejects.toThrow(/session/i);
    expect(await resolve()).toBeNull();
  });
});
