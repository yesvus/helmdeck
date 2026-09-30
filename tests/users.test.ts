// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authenticate,
  createAccountAdmin,
  createCredentialAuthAdapter,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  generateSessionSecret,
  hashPassword,
  normalizeEmail,
  type AccountAdminPolicy,
  type AccountRecord,
  type AdminSessionCookieIO,
  type CredentialStore,
} from "../src/baseline";
import type { AdminPersistenceAdapter, AdminSession } from "../src/adapters/index";

/**
 * The account surface, called the way a server action calls it rather than through a page.
 *
 * Nothing here reads a rendered view to decide whether a refusal happened. Every refusal is the
 * exported function refusing an argument the caller chose, with the session the server resolved,
 * which is the call an attacker makes when the button is missing.
 */

const SECRET = generateSessionSecret();
const PASSWORD = "correct horse battery staple";
const OWNER = "owner@example.test";

/** The two roles this host has. Anything else is a role its rule does not define. */
const ROLES = ["admin", "editor"] as const;

/** A cookie jar standing in for the request's own cookie store, one per browser. */
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
    tamper: (next: string) => (value = next),
  };
}

/**
 * One store and one account surface, with a call record by method name.
 *
 * `counts` is how a test proves the store was never asked rather than merely that it answered
 * nothing, which is the difference between a refusal and a refusal that had already looked something
 * up.
 */
function harness(
  options: {
    policy?: AccountAdminPolicy;
    store?: CredentialStore;
    db?: AdminPersistenceAdapter;
    /** Resolves the caller's session, as a host's server action would before reaching the surface. */
    session?: () => Promise<AdminSession | null> | AdminSession | null;
    includeSessionId?: boolean;
  } = {},
) {
  const db = options.db ?? createMemoryPersistenceAdapter();
  const store = options.store ?? createPersistenceCredentialStore(db);
  const counts = new Map<string, number>();
  const counted = new Proxy(store, {
    get(target, name: string) {
      const value = (target as unknown as Record<string, unknown>)[name];
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        return (value as (...inner: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  const admin = createAccountAdmin(counted, options.policy);
  return { db, store, counts, admin };
}

/** A host that may do every account operation, and hands out the role its rule knows. */
function everythingMay(session: AdminSession): boolean {
  return session.role !== "reader";
}

type Store = ReturnType<typeof harness>;

/** The sealed cookie value a session id becomes, through the same signer the adapter verifies with. */
async function createSessionSignerFor(secret: string, sessionId: string) {
  const { createSessionSigner } = await import("../src/baseline/session");
  return createSessionSigner(secret).seal(sessionId);
}

/** An account row written straight into the persistence, as a seed or a fixture would. */
async function seed(db: AdminPersistenceAdapter, overrides: Record<string, unknown> = {}) {
  const row = await db.create<Record<string, unknown>>("users", {
    email: normalizeEmail(OWNER),
    password_hash: await hashPassword(PASSWORD),
    role: "admin",
    ...overrides,
  });
  return String(row.id);
}

/** An account written through a store's own write, for a test that holds a store and not a table. */
async function seedStore(store: CredentialStore) {
  const account = await store.createUser!({
    email: normalizeEmail(OWNER),
    passwordHash: await hashPassword(PASSWORD),
    role: "admin",
  });
  return account.id;
}

const ADMIN_SESSION: AdminSession = { email: OWNER, role: "admin" };
const EDITOR_SESSION: AdminSession = { email: "editor@example.test", role: "editor" };

/** Every store call that would mean a write landed, named for a test to assert about. */
const WRITES = ["createUser", "updateUser", "createSession", "deleteSession", "deleteSessionsForUser"];

function writesAttempted(counts: Map<string, number>): string[] {
  return [...counts.entries()].filter(([name]) => WRITES.includes(name)).map(([name]) => name);
}

async function sessionRows(db: AdminPersistenceAdapter) {
  return db.query<Record<string, unknown>>("sessions");
}

async function userRows(db: AdminPersistenceAdapter) {
  return db.query<Record<string, unknown>>("users");
}

describe("an account the surface created is one the sign-in accepts", () => {
  it("signs in with the password given and refuses a wrong one, over a real store", async () => {
    const { admin, db } = harness({ policy: { may: { create: everythingMay } } });
    const cookie = jar();
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: createPersistenceCredentialStore(db),
      cookie: cookie.io,
    });

    const created = await admin.create(ADMIN_SESSION, {
      email: "  New@Example.Test ",
      password: PASSWORD,
      role: "editor",
    });
    expect(created.ok).toBe(true);

    // The sign-in, through the cookie rather than through the row that was just written, because
    // "the row exists" is not the property: what a host needs is an account a person can use.
    expect(await auth.login({ email: "new@example.test", password: PASSWORD })).toMatchObject({
      ok: true,
      session: { email: "new@example.test", role: "editor" },
    });
    expect(await auth.login({ email: "new@example.test", password: "not-the-password" })).toEqual({
      ok: false,
      message: "Those credentials were not accepted.",
    });
  });

  it("stores the address folded, so a second create of it is refused rather than duplicating", async () => {
    const { admin, db } = harness({ policy: { may: { create: everythingMay } } });
    await admin.create(ADMIN_SESSION, { email: "new@example.test", password: PASSWORD });

    const again = await admin.create(ADMIN_SESSION, {
      email: " NEW@EXAMPLE.TEST ",
      password: PASSWORD,
    });

    expect(again.ok).toBe(false);
    expect(await userRows(db)).toHaveLength(1);
  });

  it("refuses a short password before the hash is derived, and writes no row", async () => {
    const { admin, db, counts } = harness({ policy: { may: { create: everythingMay } } });

    const created = await admin.create(ADMIN_SESSION, { email: "new@example.test", password: "short" });

    expect(created).toMatchObject({ ok: false });
    expect(counts.has("createUser")).toBe(false);
    expect(await userRows(db)).toEqual([]);
  });
});

describe("a disabled account is refused the sign-in and loses the sessions it had", () => {
  it("cannot sign in, and answers exactly as a wrong password does", async () => {
    // The two halves in one test, because the second is the one that is easy to miss: an account
    // that cannot start a new session but whose old one keeps working is a disabled account with a
    // hole in it.
    const { admin, db, store } = harness({
      policy: { may: { setDisabled: everythingMay } },
    });
    const id = await seed(db);
    const cookie = jar();
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: createPersistenceCredentialStore(db),
      cookie: cookie.io,
    });
    expect((await auth.login({ email: OWNER, password: PASSWORD })).ok).toBe(true);

    const disabled = await admin.setDisabled(ADMIN_SESSION, id, true);
    expect(disabled).toMatchObject({ ok: true, ended: 1 });
    expect(await auth.getSession()).toBeNull();
    expect(await sessionRows(db)).toEqual([]);

    // And the refusal is the same one a wrong password gets, so a sign-in form cannot be used to
    // ask which addresses have an account that is turned off. The disabled account is read rather
    // than guessed, because the row still exists and holds the flag.
    const row = await store.findUserById(id);
    expect(row).toMatchObject({ disabled: true });
    const signIn = await auth.login({ email: OWNER, password: PASSWORD });
    const wrong = await auth.login({ email: OWNER, password: "not-the-password" });
    expect(signIn).toEqual(wrong);
  });

  it("ends a session written after the disable, which is the race a disable does not wait for", async () => {
    // A sign-in already in flight writes its row after the disable has run. Without a check on the
    // read, the account is signed in again for the full lifetime of the cookie.
    const { admin, db } = harness({ policy: { may: { setDisabled: everythingMay } } });
    const id = await seed(db);
    await admin.setDisabled(ADMIN_SESSION, id, true);

    const store = createPersistenceCredentialStore(db);
    const row = await store.createSession(id, Math.floor(Date.now() / 1000) + 600);
    // The signed cookie an already-running sign-in would have written, built with the same secret
    // the adapter verifies with rather than by reaching into it.
    const sealed = await createSessionSignerFor(SECRET, row.id);
    const late = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar(sealed).io });

    expect(await late.getSession()).toBeNull();
    // The row went with the answer, so the next read has nothing left to find.
    expect(await store.readSession(row.id)).toBeNull();
  });

  it("signs in again once the account is turned back on", async () => {
    const { admin, db } = harness({ policy: { may: { setDisabled: everythingMay } } });
    const id = await seed(db);
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: createPersistenceCredentialStore(db),
      cookie: jar().io,
    });
    await admin.setDisabled(ADMIN_SESSION, id, true);
    expect((await auth.login({ email: OWNER, password: PASSWORD })).ok).toBe(false);

    const enabled = await admin.setDisabled(ADMIN_SESSION, id, false);

    // Turning back on ends nothing, so the count is zero rather than a number a host reads twice.
    expect(enabled).toMatchObject({ ok: true, ended: 0 });
    expect((await auth.login({ email: OWNER, password: PASSWORD })).ok).toBe(true);
  });
});

describe("a role the host's rule does not define", () => {
  it("still signs in, and the rule is what refuses it", async () => {
    // The account holds a role this host's vocabulary does not list. It is written, and it signs in,
    // because the store does not know what a role means and the rule grants an undefined role
    // nothing. The refusal below is the rule's, asked with the role the row carried.
    const { store } = harness({
      // No `roles`, which is the half of the decision under test: a host that has not declared a
      // vocabulary cannot have a role refused against it, and this one signs in holding one.
      policy: { may: { create: everythingMay } },
    });
    const written = createAccountAdmin(store, { may: { create: everythingMay } });
    await written.create(ADMIN_SESSION, {
      email: "odd@example.test",
      password: PASSWORD,
      role: "sorcerer",
    });
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar().io });

    const signedIn = await auth.login({ email: "odd@example.test", password: PASSWORD });
    expect(signedIn.ok).toBe(true);
    expect((signedIn as { session: AdminSession }).session.role).toBe("sorcerer");

    // The host's own rule is the only thing that knows what a role means, and it is asked and
    // refuses. The host's rule is the demo's shape: a map from role to what it may do, and a role
    // the map does not hold grants nothing.
    const signedInSession = (signedIn as { session: AdminSession }).session;
    const OPERATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
      ["admin", new Set(["list", "create", "setRole", "setDisabled"])],
      ["editor", new Set(["read"])],
    ]);
    const asked: { session: AdminSession; operation: string }[] = [];
    const may = (operation: string) => (session: AdminSession) => {
      asked.push({ session, operation });
      return OPERATIONS.get(session.role ?? "")?.has(operation) ?? false;
    };
    const rule = createAccountAdmin(store, {
      roles: ROLES,
      may: {
        list: may("list"),
        create: may("create"),
        setRole: may("setRole"),
        setDisabled: may("setDisabled"),
        listSessions: may("listSessions"),
        endSession: may("endSession"),
      },
    });

    const id = String((await store.listUsers!())[0].id);
    const answers = await Promise.all([
      rule.list(signedInSession),
      rule.create(signedInSession, { email: "more@example.test", password: PASSWORD }),
      rule.setRole(signedInSession, id, "admin"),
      rule.setDisabled(signedInSession, id, true),
      rule.listSessions(signedInSession),
      rule.endSession(signedInSession, "any-session"),
    ]);

    // Every operation answers the same way, and the role column is refused before the write, so
    // the account cannot be promoted into a role the rule does define from outside the rule.
    for (const answer of answers) {
      expect(answer).toEqual({ ok: false, message: "This account may not do that." });
    }
    // Asserted by the rule being asked with the stored role rather than by nothing rendering.
    expect(asked.map((entry) => entry.operation)).toEqual([
      "list",
      "create",
      "setRole",
      "setDisabled",
      "listSessions",
      "endSession",
    ]);
    expect(new Set(asked.map((entry) => entry.session.role))).toEqual(new Set(["sorcerer"]));
  });

  it("refuses a write naming an undefined role, and says which roles this host has", async () => {
    const { admin, counts } = harness({ policy: { may: { create: everythingMay }, roles: ROLES } });

    const created = await admin.create(ADMIN_SESSION, {
      email: "odd@example.test",
      password: PASSWORD,
      role: "sorcerer",
    });

    expect(created).toEqual({
      ok: false,
      message: 'This host has no role called "sorcerer". It has "admin", "editor".',
    });
    expect(counts.has("createUser")).toBe(false);
  });

  it("accepts any role when the host declared no vocabulary, because it has said what none is", async () => {
    // A host that has not said what a role is cannot have a role refused against it. The package
    // guessing a vocabulary here would be the rule every host has to fight, one level down.
    const { admin, db } = harness({ policy: { may: { create: everythingMay } } });

    const created = await admin.create(ADMIN_SESSION, {
      email: "odd@example.test",
      password: PASSWORD,
      role: "sorcerer",
    });

    expect(created).toMatchObject({ ok: true, account: { role: "sorcerer" } });
    expect((await userRows(db))[0].role).toBe("sorcerer");
  });
});

describe("every operation is refused to a session that may not do it", () => {
  /** Each entry is a call an attacker makes, with a policy that permits nothing. */
  const CALLS: Record<string, (admin: Store["admin"], session: AdminSession | null) => Promise<unknown>> = {
    list: (admin, session) => admin.list(session),
    create: (admin, session) => admin.create(session, { email: "x@example.test", password: PASSWORD }),
    setRole: (admin, session) => admin.setRole(session, "any", "admin"),
    setDisabled: (admin, session) => admin.setDisabled(session, "any", true),
    listSessions: (admin, session) => admin.listSessions(session),
    endSession: (admin, session) => admin.endSession(session, "any"),
  };

  for (const [name, call] of Object.entries(CALLS)) {
    it(`refuses ${name} to a caller the host permits nothing, and writes nothing`, async () => {
      // No `may` at all rather than one that answers false, because absent-means-refused is the
      // default a host that has not thought about the capability actually gets.
      const { admin, db, counts } = harness();
      await seed(db);

      const result = await call(admin, EDITOR_SESSION);

      expect(result).toEqual({ ok: false, message: "This account may not do that." });
      expect(writesAttempted(counts)).toEqual([]);
    });
  }

  it("refuses every operation to a caller with no session, because there is nobody to permit", async () => {
    const { admin, db, counts } = harness({ policy: { may: { list: () => true, create: () => true } } });
    await seed(db);

    for (const call of Object.values(CALLS)) {
      expect(await call(admin, null)).toEqual({
        ok: false,
        message: "There is no session to do this as.",
      });
    }
    expect(writesAttempted(counts)).toEqual([]);
  });

  it("gives the policy the stored role, which a request cannot write", async () => {
    const seen: AdminSession[] = [];
    const { admin, db } = harness({
      policy: {
        may: {
          list: (session) => {
            seen.push(session);
            return false;
          },
        },
      },
    });
    await seed(db, { role: "editor" });

    await admin.list({ email: OWNER, role: "admin" });

    // The session is the caller's, taken as given here because resolving one is the host's job. What
    // the package guarantees is that it never reads a role from anywhere else, and a policy that
    // switches on the role is the whole reason a forged one could not be written into a row.
    expect(seen).toEqual([{ email: OWNER, role: "admin" }]);
  });

  it("refuses setRole and setDisabled for one account while permitting another", async () => {
    // The per-account half of a rule, written the way the resource rule is: about the id, not about
    // the row. A host that wants to decide on the record looks it up in its own rule, which is
    // where a store read belongs.
    const withheld = new Set<string>();
    const { admin, db } = harness({
      policy: {
        may: {
          setRole: (session, accountId) => session.role === "admin" && !withheld.has(accountId),
          setDisabled: (session, accountId) => session.role === "admin" && !withheld.has(accountId),
        },
      },
    });
    const editor = await seed(db, { email: "editor@example.test", role: "editor" });
    const other = await seed(db, { email: "other@example.test", role: "admin" });
    withheld.add(other);

    expect(await admin.setRole(ADMIN_SESSION, editor, "editor")).toMatchObject({ ok: true });
    const refused = await admin.setRole(ADMIN_SESSION, other, "editor");
    expect(refused).toEqual({ ok: false, message: "This account may not do that." });
    // The refusal reached neither a read nor a write, so a caller with no permission cannot tell an
    // id that exists from one that does not.
    expect((await userRows(db)).find((row) => row.id === other)?.role).toBe("admin");
  });

  it("never reaches the store for an operation the caller may not do, for any id it names", async () => {
    const { admin, db, counts } = harness();
    const id = await seed(db);
    counts.clear();

    expect(await admin.setRole(EDITOR_SESSION, id, "admin")).toMatchObject({ ok: false });
    expect(await admin.setDisabled(EDITOR_SESSION, id, true)).toMatchObject({ ok: false });
    expect(await admin.setDisabled(EDITOR_SESSION, "no-such-account", true)).toMatchObject({ ok: false });
    expect([...counts.keys()]).toEqual([]);
  });

  it("reports a missing account as a missing account rather than as a refusal", async () => {
    const { admin } = harness({ policy: { may: { setRole: everythingMay, setDisabled: everythingMay } } });

    expect(await admin.setRole(ADMIN_SESSION, "nobody", "editor")).toEqual({
      ok: false,
      message: "There is no such account.",
    });
    expect(await admin.setDisabled(ADMIN_SESSION, "nobody", true)).toEqual({
      ok: false,
      message: "There is no such account.",
    });
  });
});

describe("ending a session works by the id the host has", () => {
  /** Two browsers for one account, so there is a session the caller's own does not cover. */
  async function twoBrowsers(policy?: AccountAdminPolicy) {
    const db = createMemoryPersistenceAdapter();
    await seed(db);
    const store = createPersistenceCredentialStore(db);
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
    const app = harness({
      db,
      store,
      policy: { may: { listSessions: everythingMay, endSession: everythingMay }, ...policy },
    });
    return { desktop, laptop, desktopCookie, laptopCookie, ...app };
  }

  it("ends the named session and leaves the other one signed in", async () => {
    const { admin, store, desktop, laptop } = await twoBrowsers();
    const rows = await store.listSessions!();
    expect(rows).toHaveLength(2);

    // The list is the only place the ids come from, and the caller's own row is marked by the id on
    // its session. Without that, a list of two identical rows cannot say which one is this browser.
    const caller = await desktop.getSession();
    const listed = await admin.listSessions(caller);
    const sessions = (listed as { sessions: { id: string; current: boolean }[] }).sessions;
    expect(sessions).toHaveLength(2);
    const mine = sessions.filter((row) => row.current);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(caller?.id);

    const ended = await admin.endSession(caller, mine[0].id);
    expect(ended).toEqual({ ok: true, ended: true });
    expect(await desktop.getSession()).toBeNull();
    expect(await laptop.getSession()).toMatchObject({ email: OWNER });
  });

  it("refuses the disabled account from authenticate itself, and at the same cost", async () => {
    // `authenticate` is its own export, and a host calling it directly gets no second chance: the
    // read path is not in that call. The login path alone would not hold this up, because a refused
    // verify is caught again by the session read that follows it, so the sign-in answer would stay
    // correct with the check here removed.
    const db = createMemoryPersistenceAdapter();
    await seed(db, { disabled: 1 });
    const store = createPersistenceCredentialStore(db);

    expect(await authenticate(store, OWNER, PASSWORD)).toBeNull();
    // And at the same cost as a wrong password, because an attempt that answers sooner is an answer.
    const timeFor = async (password: string) => {
      const started = process.hrtime.bigint();
      await authenticate(store, OWNER, password);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const wrong = await timeFor("not-the-password");
    const disabled = await timeFor(PASSWORD);
    expect(disabled).toBeGreaterThan(wrong * 0.2);
  });

  it("answers a session that has already ended as a success, not a refusal", async () => {
    const { admin, store, desktop } = await twoBrowsers();
    const [first] = await store.listSessions!();
    const session = await desktop.getSession();
    await admin.endSession(session, first.id);

    // Two browsers pressing the same button is the ordinary case, and neither of them did anything
    // wrong. A refusal here would train a host to retry, and to show an error for a revoke that
    // worked.
    expect(await admin.endSession(session, first.id)).toEqual({ ok: true, ended: false });
    expect(await admin.endSession(session, "an-id-nobody-had")).toEqual({ ok: true, ended: false });
  });

  it("carries no id when the host did not ask for one, and lists no current row", async () => {
    // The migration, stated as a fact rather than as a promise: a host that has not turned
    // `includeSessionId` on resolves a session with no id on it, and its list marks nothing current.
    const db = createMemoryPersistenceAdapter();
    await seed(db);
    const store = createPersistenceCredentialStore(db);
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: jar().io });
    await auth.login({ email: OWNER, password: PASSWORD });
    const admin = createAccountAdmin(store, {
      may: { listSessions: everythingMay, endSession: everythingMay },
    });

    const session = await auth.getSession();
    expect(session).toEqual({ email: OWNER, role: "admin" });
    const listed = await admin.listSessions(session);
    expect((listed as { sessions: { current: boolean }[] }).sessions.every((row) => !row.current)).toBe(true);
  });
});

describe("a hash is never readable by anything", () => {
  it("keeps it out of the row the account surface reports, and out of the result", async () => {
    const { admin } = harness({ policy: { may: { create: everythingMay, list: everythingMay } } });
    const created = await admin.create(ADMIN_SESSION, { email: "new@example.test", password: PASSWORD });

    // Asserted on the row and the result rather than on the absence of a log, because a log is
    // wherever the host put it and a return value is here.
    expect(JSON.stringify(created)).not.toContain(PASSWORD);
    expect(JSON.stringify(created)).not.toMatch(/scrypt\$/);
    const listed = await admin.list(ADMIN_SESSION);
    expect(JSON.stringify(listed)).not.toMatch(/scrypt\$/);
    for (const account of (listed as { accounts: AccountRecord[] }).accounts) {
      expect(Object.keys(account)).not.toContain("passwordHash");
    }
  });

  it("stores the password hashed, and never in the clear, in the row the store holds", async () => {
    const { admin, db } = harness({ policy: { may: { create: everythingMay } } });
    await admin.create(ADMIN_SESSION, { email: "new@example.test", password: PASSWORD });

    const [row] = await userRows(db);
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(String(row.password_hash)).not.toContain(PASSWORD);
    // And no other column holds it either, so a listing that names every column cannot reach it.
    expect(Object.values(row).map(String)).not.toContain(PASSWORD);
  });

  it("holds nothing a log line would print, so no value here can be logged by a future edit", () => {
    // Read off the source rather than spied on at runtime, because a spy only sees the calls this
    // test happens to make: the property is that the module has no way to print at all, so a
    // `console` added later with an account in scope is the mutation this catches.
    const source = readFileSync(
      join(import.meta.dirname, "..", "src", "baseline", "users.ts"),
      "utf8",
    ).replace(/^\s*(\*|\/\/).*$/gm, "");

    expect(source).not.toMatch(/\bconsole\s*\./);
  });

  it("hands a policy only an id, so no row reaches host code that might print it", async () => {
    // The shape rather than the call sites: what a policy receives is the one thing a host cannot
    // accidentally log a credential from, because it is an id and the session it already had.
    const { store } = harness();
    const id = await seedStore(store);
    const seen: { session: AdminSession; accountId: string }[] = [];
    const admin = createAccountAdmin(store, {
      may: {
        setRole: (session, accountId) => {
          seen.push({ session, accountId });
          return false;
        },
      },
    });

    await admin.setRole(ADMIN_SESSION, id, "editor");

    expect(seen).toEqual([{ session: ADMIN_SESSION, accountId: id }]);
    expect(JSON.stringify(seen)).not.toMatch(/scrypt\$|passwordHash/);
  });
});

describe("the account surface a host without a management store gets", () => {
  it("reports the gap rather than an empty list, so a missing method is not read as no accounts", async () => {
    // The four account methods are optional, and a store written before they existed is a working
    // sign-in. Reporting an empty account list would be the one answer that cannot be told apart
    // from an admin with nobody in it.
    const store: CredentialStore = {
      findUserByEmail: async () => null,
      findUserById: async () => null,
      createSession: async () => ({ id: "s1", userId: "u1", expiresAt: 0 }),
      readSession: async () => null,
      deleteSession: async () => {},
      deleteSessionsForUser: async () => 0,
    };
    const admin = createAccountAdmin(store, { may: { list: () => true, listSessions: () => true } });

    expect(await admin.list(ADMIN_SESSION)).toMatchObject({ ok: false });
    expect((await admin.list(ADMIN_SESSION) as { message: string }).message).toContain("listUsers");
    expect(await admin.listSessions(ADMIN_SESSION)).toMatchObject({ ok: false });
  });
});
