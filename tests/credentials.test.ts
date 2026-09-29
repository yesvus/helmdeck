// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import type { AdminPersistenceAdapter } from "../src/adapters/index";
import {
  createCredentialAuthAdapter,
  createPersistenceCredentialStore,
  generateSessionSecret,
  hashPassword,
  normalizeEmail,
  verifyPassword,
  CREDENTIAL_SESSIONS_SCHEMA,
  CREDENTIAL_USERS_SCHEMA,
} from "../src/baseline";
import type { AdminSessionCookieIO, CredentialStore } from "../src/baseline";

/**
 * The six properties the demo's implementation had, which have to survive the move into the
 * package, each named after the one it proves rather than after the code it exercises.
 */

const PASSWORD = "correct horse battery staple";
const EMAIL = "owner@demo.helmdeck.dev";
const SECRET = generateSessionSecret();
const sourceRoot = resolve(import.meta.dirname, "..", "src");

/** Every TypeScript file under src, so a secret is looked for where a secret would be added. */
function sourcesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourcesIn(path)
      : /\.tsx?$/.test(entry)
        ? [path]
        : [];
  });
}

const sourceFiles = sourcesIn(sourceRoot);

/** A cookie jar standing in for the request's own cookie store. */
function jar(initial?: string) {
  let value = initial;
  const writes: string[] = [];
  const clears: string[] = [];
  const io: AdminSessionCookieIO = {
    read: () => value,
    write: (next, options) => {
      value = next;
      writes.push(next);
      writes.push(JSON.stringify(options));
    },
    clear: () => {
      value = undefined;
      clears.push("cleared");
    },
  };
  return { io, writes, clears, peek: () => value, tamper: (next: string) => (value = next) };
}

/** An account in the store, in the column names the shipped schema uses. */
async function account(
  db: AdminPersistenceAdapter,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const row = await db.create<Record<string, unknown>>("users", {
    email: normalizeEmail(EMAIL),
    password_hash: await hashPassword(PASSWORD),
    role: "admin",
    ...overrides,
  });
  return { id: String(row.id) };
}

/**
 * One store, one browser, so a test can say which session it means.
 *
 * `counting` records every store call by name, which is how a test proves the store was never
 * asked rather than merely that it answered null.
 */
function harness(options: { store?: CredentialStore; db?: AdminPersistenceAdapter } = {}) {
  const db = options.db ?? createMemoryPersistenceAdapter();
  const store = options.store ?? createPersistenceCredentialStore(db);
  const counts = new Map<string, number>();
  const counted: CredentialStore = {
    findUserByEmail: async (email) => {
      counts.set("findUserByEmail", (counts.get("findUserByEmail") ?? 0) + 1);
      return store.findUserByEmail(email);
    },
    findUserById: async (id) => {
      counts.set("findUserById", (counts.get("findUserById") ?? 0) + 1);
      return store.findUserById(id);
    },
    createSession: async (userId, expiresAt) => {
      counts.set("createSession", (counts.get("createSession") ?? 0) + 1);
      return store.createSession(userId, expiresAt);
    },
    readSession: async (id) => {
      counts.set("readSession", (counts.get("readSession") ?? 0) + 1);
      return store.readSession(id);
    },
    deleteSession: async (id) => {
      counts.set("deleteSession", (counts.get("deleteSession") ?? 0) + 1);
      return store.deleteSession(id);
    },
    deleteSessionsForUser: async (userId) => {
      counts.set("deleteSessionsForUser", (counts.get("deleteSessionsForUser") ?? 0) + 1);
      return store.deleteSessionsForUser(userId);
    },
  };
  const cookie = jar();
  const auth = createCredentialAuthAdapter({ secret: SECRET, store: counted, cookie: cookie.io });
  return { db, store, counts, cookie, auth };
}

async function sessionsIn(db: AdminPersistenceAdapter): Promise<Record<string, unknown>[]> {
  return db.query<Record<string, unknown>>("sessions");
}

describe("the password primitives", () => {
  it("hashes with a salt, so two accounts with one password are not identical in a dump", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(a).not.toBe(b);
    // Without a salt, a stolen table hands over every account sharing a password at once.
    expect(a).not.toContain(PASSWORD);
  });

  it("accepts the right password and refuses a wrong one", async () => {
    const stored = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${PASSWORD}x`, stored)).toBe(false);
  });

  it("refuses a stored value this module did not write, rather than parsing it", async () => {
    // A row that was never hashed, or was hashed by something else, must fail the sign-in
    // rather than take the login page down.
    for (const stored of ["", "plaintext", "bcrypt$abc$def", "scrypt$", "scrypt$c2FsdA=="]) {
      expect(await verifyPassword(PASSWORD, stored), stored).toBe(false);
    }
  });

  it("refuses a stored hash whose key decodes to nothing", async () => {
    // "!" is not base64, so it decodes to a zero-length key, and deriving a key of length zero
    // is the kind of input that throws rather than returning a wrong answer.
    expect(await verifyPassword(PASSWORD, "scrypt$c2FsdA==$!")).toBe(false);
  });

  it("compares the derived key with a constant-time comparison", () => {
    // The one property in this file a black-box test cannot hold. A `===` over the two keys
    // returns exactly the same answer as `timingSafeEqual` for every input; what differs is how
    // long the answer takes as the first differing byte moves right, and a test that timed
    // sixty-four bytes would be measuring the machine rather than the code. So this reads the
    // comparison rather than calling it, and the mutation it is there to catch is the one
    // above it: swapping `timingSafeEqual` for a string compare, which passes every behavioural
    // test in this file.
    const source = readFileSync(
      join(sourceRoot, "baseline", "passwords.ts"),
      "utf8",
    ).replace(/^\s*\*.*$/gm, "");

    expect(source).toMatch(/timingSafeEqual\s*\(\s*actual\s*,\s*expected\s*\)/);
    // The early-return on differing lengths is not the same as a byte-by-byte comparison, but
    // it is also not this: `timingSafeEqual` is what refuses the mismatch, and a `===` over the
    // two base64 strings is the thing that must not be here.
    expect(source).not.toMatch(/toString\("base64"\)\s*===/);
    expect(source).not.toMatch(/actual\s*===\s*expected/);
  });
});

describe("property 1: an unknown address is answered exactly as a wrong password", () => {
  it("returns the same refusal for both, in status and in body", async () => {
    const { auth, db } = harness();
    await account(db);

    const unknown = await auth.login({ email: "nobody@demo.helmdeck.dev", password: PASSWORD });
    const wrong = await auth.login({ email: EMAIL, password: "not-the-password" });

    // Equal answers, not merely two refusals: a form that says one of these two things reports
    // which addresses have accounts.
    expect(unknown).toEqual(wrong);
    expect(unknown).toEqual({ ok: false, message: "Those credentials were not accepted." });
  });

  it("writes no cookie for either refusal", async () => {
    const { auth, cookie, db } = harness();
    await account(db);

    await auth.login({ email: "nobody@demo.helmdeck.dev", password: PASSWORD });
    await auth.login({ email: EMAIL, password: "not-the-password" });

    expect(cookie.writes).toEqual([]);
    expect(await sessionsIn(db)).toEqual([]);
  });

  it("does not answer an unknown address noticeably faster than a wrong password", async () => {
    // An answer that is merely equal, but much faster, still enumerates users. The margin is
    // loose on purpose: this is a smoke check against a gross difference, not a benchmark.
    const { auth, db } = harness();
    await account(db);
    // The first unknown-address attempt also builds the decoy hash, so a cold process is not
    // what is being compared here.
    await auth.login({ email: "nobody@demo.helmdeck.dev", password: "warmup" });

    const timeFor = async (email: string) => {
      const started = process.hrtime.bigint();
      await auth.login({ email, password: "wrong" });
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const wrong = await timeFor(EMAIL);
    const unknown = await timeFor("nobody@demo.helmdeck.dev");

    expect(unknown).toBeGreaterThan(wrong * 0.2);
  });
});

describe("property 2: signing out ends the row, so a replayed cookie is refused", () => {
  it("ends the row on the server, and a cookie replayed afterwards resolves to nothing", async () => {
    const { auth, db, cookie, store } = harness();
    const owner = await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);
    const sealed = cookie.peek();

    await auth.logout();

    expect(await store.readSession(String(row.id))).toBeNull();
    expect(await auth.getSession()).toBeNull();
    expect(cookie.peek()).toBeUndefined();

    // Replayed into a fresh browser, because a cookie that still verified would mean the only
    // thing sign-out cleared was this browser's copy of it.
    const replayed = jar(sealed!);
    const replaying = createCredentialAuthAdapter({ secret: SECRET, store, cookie: replayed.io });
    expect(await replaying.getSession()).toBeNull();
    expect(await sessionsIn(db)).toEqual([]);
    expect(owner.id).toBeTruthy();
  });

  it("ends every session an account holds, across browsers", async () => {
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    const owner = await account(db);
    const desktop = harness({ db, store });
    const laptop = harness({ db, store });
    await desktop.auth.login({ email: EMAIL, password: PASSWORD });
    await laptop.auth.login({ email: EMAIL, password: PASSWORD });

    expect(await desktop.auth.endAllSessions(EMAIL)).toBe(2);
    expect(await desktop.auth.getSession()).toBeNull();
    expect(await laptop.auth.getSession()).toBeNull();
    expect(owner.id).toBeTruthy();
  });

  it("leaves another account's sessions alone", async () => {
    const { auth, db } = harness();
    await account(db, { email: normalizeEmail("editor@demo.helmdeck.dev") });
    await account(db);
    await auth.login({ email: "editor@demo.helmdeck.dev", password: PASSWORD });

    expect(await auth.endAllSessions(EMAIL)).toBe(0);
    expect(await auth.getSession()).toEqual({ email: "editor@demo.helmdeck.dev", role: "admin" });
  });
});

describe("property 3: a forged cookie is refused before the store is asked anything", () => {
  it("never reaches the store, so a cookie cannot be used to ask which sessions exist", async () => {
    const { auth, counts, cookie, db } = harness();
    await account(db);
    // A real session id, taken from a real sign-in, with a signature that is not the one issued.
    const other = harness({ db });
    await other.auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);
    const stolen = String(row.id);
    cookie.tamper(`${stolen}.not-a-signature`);

    expect(await auth.getSession()).toBeNull();
    // Asserted rather than implied: null would also be the answer to any other refusal, and
    // only the count shows the store was never consulted about the id.
    expect([...counts.keys()]).toEqual([]);
  });

  it("refuses a cookie whose id was swapped for another, keeping the signature", async () => {
    const { auth, counts, cookie, db } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const sealed = cookie.peek()!;
    const signature = sealed.slice(sealed.lastIndexOf(".") + 1);
    cookie.tamper(`admin-account.${signature}`);
    // Counted from here rather than from the sign-in, which legitimately consults the store.
    counts.clear();

    expect(await auth.getSession()).toBeNull();
    expect([...counts.keys()]).toEqual([]);
  });

  it("ends nothing when a forged cookie is signed out", async () => {
    // The id is taken from a cookie the adapter accepted, so a forged one names no row.
    const editorBrowser = harness();
    await account(editorBrowser.db);
    await editorBrowser.auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(editorBrowser.db);

    const forger = harness({ db: editorBrowser.db, store: editorBrowser.store });
    forger.cookie.tamper(`${row.id}.not-a-signature`);
    await forger.auth.logout();

    expect(await editorBrowser.store.readSession(String(row.id))).not.toBeNull();
  });
});

describe("property 4: expiry is checked on read, and the row goes with it", () => {
  it("treats an expired row as no session and clears it out", async () => {
    const { auth, db, store } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);

    await db.update("sessions", String(row.id), {
      ...row,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(String(row.id))).toBeNull();
    expect(await sessionsIn(db)).toEqual([]);
  });

  it("ends a session whose expiry is not a number, rather than reading it as valid", async () => {
    // `NaN <= now` is false, so a comparison on its own treats an unparseable expiry as a
    // session that never lapses. The only way to get one is a row written by something other
    // than this store, which is exactly the case that must not read as a live session.
    const { auth, db, store } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);

    await db.update("sessions", String(row.id), { ...row, expires_at: "not-a-number" });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(String(row.id))).toBeNull();
  });

  it("ends a session whose account is no longer there", async () => {
    const { auth, db, store } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);

    await db.update("sessions", String(row.id), { ...row, user_id: "usr_withdrawn" });

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(String(row.id))).toBeNull();
  });

  it("gives the row the same lifetime the cookie is given", async () => {
    const { auth, db, cookie } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);

    // A row that outlives its cookie is a session that outlives the sign-out, and the other
    // way round is a visitor signed out while still signed in.
    const expected = Date.now() / 1000 + 60 * 60 * 24 * 14;
    expect(Number(row.expires_at)).toBeGreaterThan(expected - 60);
    expect(Number(row.expires_at)).toBeLessThan(expected + 60);
    expect(cookie.writes.join()).toContain("maxAge");
  });

  it("reads a session as signed out once its cookie is gone, without deleting the row", async () => {
    // The row outliving the cookie is the sign-out-everywhere case, and it must not be read as
    // a broken store: the row is still there to be revoked.
    const { auth, db, cookie, store } = harness();
    await account(db);
    await auth.login({ email: EMAIL, password: PASSWORD });
    const [row] = await sessionsIn(db);
    cookie.tamper(undefined!);

    expect(await auth.getSession()).toBeNull();
    expect(await store.readSession(String(row.id))).not.toBeNull();
  });
});

describe("property 5: the secret is the host's, and the package has none of its own", () => {
  it("refuses to be built without one", () => {
    const { db } = harness();
    const store = createPersistenceCredentialStore(db);
    for (const secret of ["", "short", undefined as unknown as string]) {
      expect(() => createCredentialAuthAdapter({ secret, store }), String(secret)).toThrow(/secret/);
    }
  });

  it("mints a secret long enough to be worth guessing, and a different one each time", () => {
    const first = generateSessionSecret();
    const second = generateSessionSecret();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(16);
  });

  it("agrees across instances that share a secret, which a per-process random would not", async () => {
    // Two instances of a deployed app, one secret. If the secret were generated per process,
    // the second would reject every cookie the first wrote and every visitor would read as
    // signed out.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await account(db);
    const cookie = jar();
    const instance = () =>
      createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });
    const first = instance();
    const second = instance();

    expect((await first.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    expect(await second.getSession()).toEqual({ email: EMAIL, role: "admin" });
  });

  it("refuses a cookie signed with a secret this instance does not hold", async () => {
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await account(db);
    const cookie = jar();
    const mine = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });
    await mine.login({ email: EMAIL, password: PASSWORD });

    const theirs = createCredentialAuthAdapter({
      secret: generateSessionSecret(),
      store,
      cookie: cookie.io,
    });
    expect(await theirs.getSession()).toBeNull();
  });

  it("holds no secret of its own to fall back on", () => {
    // A constant in the package is a constant in every host that forgets to configure one, and
    // every host that forgot would share it. A pasted secret is 32 random bytes in base64url, so
    // 43 characters, and that is what is looked for across the whole of src rather than only the
    // credential module: a fallback added anywhere on the path does the same damage. The
    // threshold sits above the longest identifier in the package and the literal is restricted
    // to the base64url alphabet, so paths, format templates and names are not what is caught.
    const literals = /["'`]([A-Za-z0-9_-]{40,})["'`]/g;
    const suspicious = sourceFiles.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(literals)].map((match) => `${file}: ${match[1]}`);
    });

    expect(suspicious).toEqual([]);
  });
});

describe("property 6: the credential path is server-side", () => {
  it("refuses to run in a browser that has no cookie store, rather than reading as signed out", async () => {
    const { db } = harness();
    const store = createPersistenceCredentialStore(db);
    const auth = createCredentialAuthAdapter({ secret: SECRET, store });
    // `next/headers` is the seam a browser does not have, and jsdom is the browser this suite
    // runs in. Silently returning nothing would look like a visitor who is simply signed out.
    await expect(auth.getSession()).rejects.toThrow(/server-side/);
  });

  it("does not sign in a browser either", async () => {
    const { db } = harness();
    const store = createPersistenceCredentialStore(db);
    await account(db);
    const auth = createCredentialAuthAdapter({ secret: SECRET, store });

    await expect(auth.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(/server-side/);
    // The refusal came before a row was written, so nothing is left behind to expire.
    expect(await sessionsIn(db)).toEqual([]);
  });
});

describe("what a host configures", () => {
  it("reads the table and column names it is given", async () => {
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db, {
      users: "accounts",
      sessions: "logins",
      userColumns: { email: "login", passwordHash: "pw", role: "kind" },
      sessionColumns: { userId: "account_id", createdAt: "started_at", expiresAt: "valid_until" },
    });
    await db.create("accounts", { id: "a1", login: normalizeEmail(EMAIL), pw: await hashPassword(PASSWORD), kind: "editor" });
    const cookie = jar();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });

    expect(await auth.login({ email: EMAIL, password: PASSWORD })).toEqual({
      ok: true,
      session: { email: EMAIL, role: "editor" },
    });
    const [row] = await db.query<Record<string, unknown>>("logins");
    expect(row.account_id).toBe("a1");
    expect(typeof row.valid_until).toBe("number");
  });

  it("finds an account stored with a differently spelled name column", async () => {
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db, { userColumns: { name: "display_name" } });
    await db.create("users", {
      id: "u1",
      email: normalizeEmail(EMAIL),
      password_hash: await hashPassword(PASSWORD),
      role: "admin",
      display_name: "Ada",
    });
    const cookie = jar();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });

    expect((await auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    expect(await auth.getSession()).toEqual({ email: EMAIL, name: "Ada", role: "admin" });
  });

  it("takes a store the host wrote itself, which is the seam the package offers", async () => {
    const rows = new Map<string, { id: string; userId: string; expiresAt: number }>();
    const users = new Map<string, { id: string; email: string; passwordHash: string; role: string }>();
    users.set("u1", { id: "u1", email: EMAIL, passwordHash: await hashPassword(PASSWORD), role: "admin" });
    let sequence = 0;
    const store: CredentialStore = {
      findUserByEmail: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findUserById: async (id) => users.get(id) ?? null,
      createSession: async (userId, expiresAt) => {
        sequence += 1;
        const row = { id: `s${sequence}`, userId, expiresAt };
        rows.set(row.id, row);
        return row;
      },
      readSession: async (id) => rows.get(id) ?? null,
      deleteSession: async (id) => void rows.delete(id),
      deleteSessionsForUser: async (userId) => {
        const held = [...rows.values()].filter((row) => row.userId === userId);
        for (const row of held) rows.delete(row.id);
        return held.length;
      },
    };
    const cookie = jar();
    const auth = createCredentialAuthAdapter({ secret: SECRET, store, cookie: cookie.io });

    expect((await auth.login({ email: EMAIL, password: PASSWORD })).ok).toBe(true);
    expect(await auth.getSession()).toEqual({ email: EMAIL, role: "admin" });
    await auth.logout();
    expect(rows.size).toBe(0);
  });

  it("matches the address without regard to case or surrounding space", async () => {
    const { auth, db } = harness();
    await account(db);

    expect((await auth.login({ email: `  ${EMAIL.toUpperCase()} `, password: PASSWORD })).ok).toBe(true);
  });

  it("ends the row it wrote when the cookie cannot be stored", async () => {
    // The row is written before the cookie, so a failure in between leaves a session nobody
    // holds the id to unless it is ended here.
    const { db, store } = harness();
    await account(db);
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store,
      cookie: {
        read: () => undefined,
        write: () => {
          throw new Error("cookie store unavailable");
        },
        clear: () => {},
      },
    });

    await expect(auth.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(/unavailable/);
    expect(await sessionsIn(db)).toEqual([]);
  });

  it("writes the cookie with the attributes a session cookie needs", async () => {
    const { auth, db, cookie } = harness();
    await account(db);

    await auth.login({ email: EMAIL, password: PASSWORD });

    const options = JSON.parse(cookie.writes[1]);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  });
});

describe("the schema the store expects", () => {
  it("declares the constraints an adapter alone cannot enforce", () => {
    // A constraint the database does not enforce is a comment, and the adapter can be bypassed
    // by a hand-edited request.
    expect(CREDENTIAL_USERS_SCHEMA).toContain("UNIQUE");
    expect(CREDENTIAL_USERS_SCHEMA).toContain("CHECK");
    expect(CREDENTIAL_SESSIONS_SCHEMA).toContain("expires_at INTEGER NOT NULL");
    expect(CREDENTIAL_SESSIONS_SCHEMA).toContain("ON DELETE CASCADE");
  });

  it("keeps an expiry in seconds, which is what the store compares", () => {
    expect(CREDENTIAL_SESSIONS_SCHEMA).toContain("expires_at INTEGER NOT NULL");
  });
});

describe("the adapter the shell is given", () => {
  it("is the host contract, plus the revocation the contract has no room for", () => {
    const { auth } = harness();

    expect(Object.keys(auth).sort()).toEqual([
      "endAllSessions",
      "getSession",
      "login",
      "logout",
    ]);
  });

  it("reports a store failure through onError rather than throwing at the caller", async () => {
    const onError = vi.fn();
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    await account(db);
    const cookie = jar();
    // Signing in has to work, so the failure is on the read that follows it. Without the
    // channel a store that is briefly unreachable is indistinguishable from a sign-out, and
    // the provider treats a thrown read as a failure to decide.
    let reads = 0;
    const auth = createCredentialAuthAdapter({
      secret: SECRET,
      store: {
        ...store,
        readSession: (id) => {
          reads += 1;
          return reads > 1 ? Promise.reject(new Error("store down")) : store.readSession(id);
        },
      },
      cookie: cookie.io,
      onError,
    });
    await auth.login({ email: EMAIL, password: PASSWORD });

    expect(await auth.getSession()).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
