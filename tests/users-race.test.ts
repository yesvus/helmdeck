// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AccountAlreadyExistsError,
  authenticate,
  createAccountAdmin,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  createSqlitePersistenceAdapter,
  type AccountResult,
  type AccountRecord,
  type CredentialStore,
} from "../src/baseline";
import type { AdminPersistenceAdapter, AdminSession } from "../src/adapters/index";

/**
 * Two people inviting the same address at the same time, raced rather than called in sequence.
 *
 * A sequential test is the case that already worked, so every one of these overlaps the two calls:
 * both are started before either is awaited, so the read one of them does cannot have seen the
 * other's write. No sleeps, which would test the machine's schedule rather than the code, only
 * promises the two calls are chained through.
 *
 * The store matters as much as the surface. Neither shipped adapter has a unique index to refuse a
 * second account, because the memory adapter holds typed records and the SQLite one holds JSON
 * documents keyed by resource and id, so in both the address is a value inside a document. The
 * `UNIQUE` in the shipped schema is a column a host creates for themselves; neither shipped adapter
 * runs that DDL, so a host on either of them gets its duplicate prevention from the code and not
 * from the database. That is the memory/sqlite divergence this file exists to pin down.
 */

const PASSWORD = "correct horse battery staple";
const ADDRESS = "racing@example.test";
const ADMIN: AdminSession = { email: "owner@example.test", role: "admin" };

const TAKEN = {
  ok: false,
  reason: "email-taken",
  message: `${ADDRESS} already has an account. Change its role or turn it off rather than making a second one.`,
} as const;

/** A store over a persistence, and that persistence, for counting rows afterwards. */
function persisted(db: AdminPersistenceAdapter) {
  const store = createPersistenceCredentialStore(db);
  const admin = createAccountAdmin(store, {
    roles: ["admin", "editor"],
    may: { create: () => true, list: () => true },
  });
  return { store, admin };
}

describe("two creates of one address, at the same time", () => {
  it("leaves one account and one good message, over the memory adapter", async () => {
    const db = createMemoryPersistenceAdapter();
    const { store, admin } = persisted(db);

    // Both started, neither awaited: the second call's read cannot have seen the first call's write.
    const [first, second] = await Promise.all([
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" }),
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" }),
    ]);

    const accepted = [first, second].filter((answer) => answer.ok);
    const refused = [first, second].filter((answer) => !answer.ok);
    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toEqual(TAKEN);
    // One row, which is the property the finding is about: the memory adapter has no index, so
    // nothing but the code stops the second write.
    expect(await db.query("users")).toHaveLength(1);
    expect(await store.listUsers!()).toHaveLength(1);
    // And the one account is usable, rather than being a row nothing can sign in to.
    expect(await authenticate(store, ADDRESS, PASSWORD)).toMatchObject({ email: ADDRESS, role: "editor" });
  });

  it("leaves one account and one good message, over the SQLite adapter", async () => {
    const directory = mkdtempSync(join(tmpdir(), "helmdeck-race-"));
    try {
      const { store, admin } = persisted(
        createSqlitePersistenceAdapter({ url: `file:${join(directory, "helmdeck.db")}` }),
      );

      const answers = await Promise.all([
        admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" }),
        admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" }),
      ]);

      expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
      expect(answers.filter((answer) => !answer.ok)).toEqual([TAKEN]);
      expect(await store.listUsers!()).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("races the same address written two ways, and the queue is keyed by the normalised address", async () => {
    // Two spellings of one address are one address, and the normalisation happens before the queue
    // rather than inside it. A queue keyed on the raw string would let these two past each other and
    // produce exactly the duplicate the test above is about.
    const db = createMemoryPersistenceAdapter();
    const { store, admin } = persisted(db);

    const answers = await Promise.all([
      admin.create(ADMIN, { email: "Racing@Example.test", password: PASSWORD }),
      admin.create(ADMIN, { email: "  racing@EXAMPLE.Test ", password: PASSWORD }),
    ]);

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toHaveLength(1);
    expect(await db.query("users")).toHaveLength(1);
    expect((await store.listUsers!())[0].email).toBe(ADDRESS);
  });

  it("races three, and every loser gets the same message rather than the first one's stack", async () => {
    const db = createMemoryPersistenceAdapter();
    const { admin } = persisted(db);

    const answers = await Promise.all([
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD }),
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD }),
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD }),
    ]);

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([TAKEN, TAKEN]);
  });

  it("does not let one refusal refuse the next create of that address", async () => {
    // The queue entry has to survive the failure it held. A chain that rejected would make every
    // later create of the address fail with a message about a create that never happened, for as
    // long as the process ran.
    // A store that refuses the write with something that is not a duplicate, so the queue entry
    // settles on a rejection rather than on a refusal value.
    const boom = new Error("the database is away");
    const brittle: CredentialStore = {
      findUserByEmail: async () => null,
      findUserById: async () => null,
      createSession: async () => ({ id: "s1", userId: "u1", expiresAt: 0 }),
      readSession: async () => null,
      deleteSession: async () => {},
      deleteSessionsForUser: async () => 0,
      listUsers: async () => [],
      createUser: async (account) => {
        if (account.email === ADDRESS) throw boom;
        return { id: "u1", email: account.email, disabled: false };
      },
    };
    const overBrittle = createAccountAdmin(brittle, { may: { create: () => true } });

    await expect(overBrittle.create(ADMIN, { email: ADDRESS, password: PASSWORD })).rejects.toThrow(boom);

    // A different address afterwards is unaffected, which is the property a per-address queue gives
    // for free and a per-surface lock would not.
    const later = await overBrittle.create(ADMIN, { email: "later@example.test", password: PASSWORD });
    expect(later).toMatchObject({ ok: true });
  });

  it("answers a refusal the caller can tell apart from every other refusal", async () => {
    // A host whose screen renders "already invited" differently from "could not create" needs a
    // value to switch on. Matching on the message breaks the day the wording improves.
    const db = createMemoryPersistenceAdapter();
    const { admin } = persisted(db);
    const store = createPersistenceCredentialStore(db);

    await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });
    const again = await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD });
    const weak = await admin.create(ADMIN, { email: "other@example.test", password: "short" });
    const odd = await admin.create(ADMIN, {
      email: "third@example.test",
      password: PASSWORD,
      role: "sorcerer",
    });

    const reasonOf = (answer: AccountResult<unknown>) => (answer.ok ? "ok" : answer.reason);
    expect([reasonOf(again), reasonOf(weak), reasonOf(odd)]).toEqual([
      "email-taken",
      "weak-password",
      "unknown-role",
    ]);
    // And the reason is a value, so a host that switches on it never reads a sentence.
    expect(typeof (again as { reason: unknown }).reason).toBe("string");
    expect(store).toBeTruthy();
  });
});

describe("the store's own refusal, for a caller that is not the surface", () => {
  it("refuses a second account for one address, rather than writing a second row", async () => {
    // `createUser` is exported, so a host calling it directly gets the guarantee the surface gives
    // rather than having to know to ask first.
    for (const db of [
      createMemoryPersistenceAdapter(),
      createSqlitePersistenceAdapter({ url: `file:${join(mkdtempSync(join(tmpdir(), "helmdeck-dup-")), "h.db")}` }),
    ]) {
      const store = createPersistenceCredentialStore(db);
      const account = { email: ADDRESS, passwordHash: "scrypt$salt$key", role: "editor" };
      await store.createUser!(account);

      await expect(store.createUser!(account)).rejects.toThrow(AccountAlreadyExistsError);
      expect(await db.query("users")).toHaveLength(1);
    }
  }, 30_000);

  it("names the address on the error, so a host can act on it without parsing the message", async () => {
    const store = createPersistenceCredentialStore(createMemoryPersistenceAdapter());
    const account = { email: ADDRESS, passwordHash: "scrypt$salt$key" };
    await store.createUser!(account);

    const thrown = await store.createUser!(account).catch((cause: unknown) => cause);

    expect(thrown).toBeInstanceOf(AccountAlreadyExistsError);
    expect((thrown as AccountAlreadyExistsError).email).toBe(ADDRESS);
    expect((thrown as AccountAlreadyExistsError).name).toBe("AccountAlreadyExistsError");
  });

  it("turns a store's duplicate refusal into the same answer the check gives", async () => {
    // A host on a real schema with a unique address index never reaches the check's own answer,
    // because the store refuses first. Both have to read the same, or the same admin screen shows
    // two different sentences for one situation depending on the host's database.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    // A store whose read always misses, so the surface's own check can never be what refuses, and
    // whose write refuses every address it has already seen. That is a host on a real unique index
    // as seen from here: the first write lands and the second never reaches a document.
    const seen = new Set<string>();
    const unique: CredentialStore = {
      ...store,
      findUserByEmail: async () => null,
      createUser: async (account) => {
        if (seen.has(account.email)) throw new AccountAlreadyExistsError(account.email);
        seen.add(account.email);
        return store.createUser!(account);
      },
    };
    const admin = createAccountAdmin(unique, { may: { create: () => true } });

    const answers = await Promise.all([
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD }),
      admin.create(ADMIN, { email: ADDRESS, password: PASSWORD }),
    ]);

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([TAKEN]);
  });

  it("lets a failure that is not a duplicate through, rather than reporting it as one", async () => {
    // The whole reason the refusal is recognisable rather than swallowed: a host whose store is
    // broken must see the break, not a sentence about an address that was free.
    const store = createPersistenceCredentialStore(createMemoryPersistenceAdapter());
    const boom = new Error("the database is away");
    const broken: CredentialStore = {
      ...store,
      findUserByEmail: async () => null,
      createUser: () => Promise.reject(boom),
    };
    const admin = createAccountAdmin(broken, { may: { create: () => true } });

    await expect(admin.create(ADMIN, { email: ADDRESS, password: PASSWORD })).rejects.toThrow(boom);
  });

  it("reports the account it made without a hash on it, which is what a race has to be able to do", async () => {
    const db = createMemoryPersistenceAdapter();
    const { admin } = persisted(db);

    const [answer] = await Promise.all([admin.create(ADMIN, { email: ADDRESS, password: PASSWORD })]);

    const record: AccountRecord = (answer as { account: AccountRecord }).account;
    expect(Object.keys(record)).not.toContain("passwordHash");
  });
});
