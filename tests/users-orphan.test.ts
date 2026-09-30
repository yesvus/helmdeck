// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  authenticate,
  createAccountAdmin,
  createCredentialAuthAdapter,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  generateSessionSecret,
  type AdminSessionCookieIO,
  type CredentialStore,
} from "../src/baseline";
import { createSessionSigner } from "../src/baseline/session";
import type { AdminSession } from "../src/adapters/index";

/**
 * What is left when a disable lands between a sign-in's password check and its session row.
 *
 * A review asked whether that window can be closed. It cannot be closed by anything in the sign-in
 * path, because a re-check is a check followed by a write and the disable can still land between
 * them. What the measurement here shows is that the window does not cost a credential, and that the
 * package's own sign-in leaves no row behind at all, so this is an operational note about a row rather
 * than a security fix.
 *
 * The two properties that make it an operational note are tested first and in full: the row cannot be
 * used, and it is gone once anything has looked. What is left untested on purpose is a sweep, and the
 * reason is in the file that would have it.
 */

const PASSWORD = "correct horse battery staple";
const ADDRESS = "victim@example.test";
const ADMIN: AdminSession = { email: "owner@example.test", role: "admin" };
const SECRET = generateSessionSecret();
const IN_TWO_WEEKS = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;

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

async function withADisabledAccount() {
  const db = createMemoryPersistenceAdapter();
  const store = createPersistenceCredentialStore(db);
  const admin = createAccountAdmin(store, {
    roles: ["admin", "editor"],
    may: {
      create: () => true,
      setDisabled: () => true,
      listSessions: () => true,
      endSession: () => true,
    },
  });
  await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });
  const account = (await store.listUsers!())[0];
  await admin.setDisabled(ADMIN, account.id, true);
  return { db, store, admin, id: account.id };
}

describe("a disable that lands mid-sign-in", () => {
  it("leaves no row at all on the package's sign-in path, because the sign-in reads after it writes", async () => {
    // The interleaving, from the store's side: the account is turned off between the row being
    // written and the read that follows. `createSessionAuthAdapter.login` asks for the session after
    // the write, so the refusal and the delete happen inside the same call and the caller is handed a
    // refusal with nothing left in the table. There is no window here to close, only a moment inside
    // one function.
    const db = createMemoryPersistenceAdapter();
    const inner = createPersistenceCredentialStore(db);
    const admin = createAccountAdmin(inner, {
      roles: ["admin", "editor"],
      may: { create: () => true, setDisabled: () => true },
    });
    await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });
    const account = (await inner.listUsers!())[0];

    let flipped = false;
    const racy: CredentialStore = {
      ...inner,
      async createSession(userId, expiresAt) {
        const row = await inner.createSession(userId, expiresAt);
        if (!flipped) {
          flipped = true;
          await inner.updateUser!(account.id, { disabled: true });
        }
        return row;
      },
    };
    const auth = createCredentialAuthAdapter({ secret: SECRET, store: racy, cookie: jar().io });

    const answer = await auth.login({ email: ADDRESS, password: PASSWORD });

    expect(flipped, "the disable never landed, so nothing was raced").toBe(true);
    expect(answer).toEqual({ ok: false, message: "Those credentials were not accepted." });
    expect(await db.query("sessions")).toEqual([]);
  });

  it("refuses a row written straight to the store after a disable, and takes the row with it", async () => {
    // The orphan, made honestly: a host writing its own session rows. Nobody mints a cookie for it,
    // so nobody presents it, so it is a row rather than a credential.
    const { db, store } = await withADisabledAccount();
    const orphan = await store.createSession((await store.listUsers!())[0].id, IN_TWO_WEEKS());
    expect(await db.query("sessions")).toHaveLength(1);

    // The next thing that resolves it, which is the only way a row like this is ever reached.
    const sealed = await createSessionSigner(SECRET).seal(orphan.id);
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar(sealed).io });

    expect(await auth.getSession()).toBeNull();
    expect(await db.query("sessions")).toEqual([]);
  });

  it("mints nothing new for the account while the row is there", async () => {
    // The row is not the only thing standing between the address and a new session: the sign-in
    // refuses the account outright, so a cookie cannot be obtained for it at all.
    const { store } = await withADisabledAccount();
    await store.createSession((await store.listUsers!())[0].id, IN_TWO_WEEKS());

    expect(await authenticate(store, ADDRESS, PASSWORD)).toBeNull();
    expect(await authenticate(store, "  ADDRESS@EXAMPLE.TEST ", PASSWORD)).toBeNull();
  });

  it("shows the row in a sessions list, with the account off, so an operator can see and end it", async () => {
    // The diagnosable state, which is the reason the row is an operational note rather than a silent
    // one: a list built over live sessions says whose it is and that the account is off.
    const { store, admin } = await withADisabledAccount();
    await store.createSession((await store.listUsers!())[0].id, IN_TWO_WEEKS());

    const listed = await admin.listSessions(ADMIN);

    expect(listed).toMatchObject({
      ok: true,
      sessions: [{ accountId: expect.any(String), email: ADDRESS, disabled: true }],
    });
    // And ending it by its id works, because it is an ordinary row with an ordinary id.
    const row = (listed as { sessions: { id: string; accountId: string }[] }).sessions[0];
    expect(await admin.endSession(ADMIN, row.id)).toEqual({ ok: true, ended: true });
    expect(await store.listSessions!(row.accountId)).toEqual([]);
  });

  it("ends a leftover row the next time the account is disabled again", async () => {
    // The bound is not "forever", and this is the part of it an operator can use: a later disable of
    // the same account counts the leftover among the sessions it ends, so nothing needs a sweep.
    const { store, admin, id } = await withADisabledAccount();
    await store.createSession(id, IN_TWO_WEEKS());
    await admin.setDisabled(ADMIN, id, false);

    const again = await admin.setDisabled(ADMIN, id, true);

    expect(again).toMatchObject({ ok: true, ended: 1 });
    expect(await store.listSessions!(id)).toEqual([]);
  });

});
