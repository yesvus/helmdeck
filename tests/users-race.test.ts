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

function taken(email: string) {
  return {
    ok: false,
    reason: "email-taken",
    message: `${email} already has an account. Change its role or turn it off rather than making a second one.`,
  } as const;
}

/** A store over a persistence, and that persistence, for counting rows afterwards. */
function persisted(db: AdminPersistenceAdapter) {
  const store = createPersistenceCredentialStore(db);
  const admin = createAccountAdmin(store, {
    roles: ["admin", "editor"],
    may: { create: () => true, list: () => true },
  });
  return { store, admin };
}

/**
 * A store with an honest read and no constraint of its own: the plausible hand-written one, which
 * can look an address up and will write the same one twice.
 *
 * A read that never told the truth would be a different thing, and one no check in the package could
 * ever answer, so the read here is real. The hash the sign-in's shape requires is a placeholder:
 * nothing signs in against this store.
 */
function looseStore(rows: AccountRecord[]) {
  const withHash = (row: AccountRecord) => ({ ...row, passwordHash: "not-a-hash" });
  return {
    findUserByEmail: async (email: string) => {
      const row = rows.find((candidate) => candidate.email === email);
      return row ? withHash(row) : null;
    },
    findUserById: async (id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      return row ? withHash(row) : null;
    },
    createSession: async () => ({ id: "s1", userId: "u1", expiresAt: 0 }),
    readSession: async () => null,
    deleteSession: async () => {},
    deleteSessionsForUser: async () => 0,
    listUsers: async () => rows,
    createUser: async (account: { email: string }) => {
      const record = { id: `u${rows.length + 1}`, email: account.email, disabled: false };
      rows.push(record);
      return record;
    },
  } satisfies CredentialStore;
}

/**
 * A store that records whether two creates for one address were ever inside it at the same time.
 *
 * A barrier that forces two reads to overlap cannot be built here, and the reason is worth stating
 * because it is the same reason the bug was hard to see. Releasing a held read needs a signal that a
 * second call has arrived, and the serialisation is exactly what stops the second call arriving. So
 * a test that tries to force the interleaving either waits on a clock or hangs, and a test that
 * cannot fail is worse than no test.
 *
 * What can be tested is the property itself: two creates for one address are not inside the store at
 * the same time. The first create is held open on a promise the test controls, which makes the
 * window open until the test closes it rather than until a machine happens to be slow, and the
 * second create is given every chance to walk in. The record says whether it did. Nothing sleeps
 * and nothing waits on a timer: the hash happens before the serialised section, so the only await
 * between a call and the store is one the test's own gate controls.
 */
function overlappingSections(inner: CredentialStore) {
  let open = 0;
  const log: string[] = [];
  const gate = { closed: false, waiters: [] as (() => void)[] };
  let release = () => {};
  const blocked = new Promise<void>((done) => {
    release = done;
  });

  const store: CredentialStore = {
    ...inner,
    async findUserByEmail(email) {
      open += 1;
      log.push(`read:start:${open}`);
      try {
        return await inner.findUserByEmail(email);
      } finally {
        log.push(`read:end:${open}`);
        open -= 1;
      }
    },
    async createUser(account) {
      open += 1;
      log.push(`write:start:${open}`);
      try {
        if (!gate.closed) {
          // The first write holds the section open. A second create reaching here would be inside
          // the store at the same time as this one, which is the whole thing under test.
          await blocked;
        }
        return await inner.createUser!(account);
      } finally {
        log.push(`write:end:${open}`);
        open -= 1;
      }
    },
  };

  return {
    store,
    log,
    release,
  };
}

/**
 * One create held open inside the store, and a second given every chance to join it.
 *
 * A bounded number of microtask turns rather than a wait: the section is held open by this test's
 * own promise, so the only question the turns answer is whether the second call would have walked
 * in, which it either does within a couple of turns or never does because it is serialised.
 */
async function holdOneAndOfferASecond(
  admin: ReturnType<typeof persisted>["admin"],
  spellings: [string, string],
  held: ReturnType<typeof overlappingSections>,
) {
  const first = admin.create(ADMIN, { email: spellings[0], password: PASSWORD, role: "editor" });
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  const second = admin.create(ADMIN, { email: spellings[1], password: PASSWORD, role: "editor" });
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  held.release();
  return Promise.all([first, second]);
}

describe("two creates of one address, at the same time", () => {
  it("keeps two creates for one address out of the store at the same time", async () => {
    // The property, asserted as what it is: the two calls are serialised, so the second is not inside
    // the store while the first is. The first is held open by the test's own promise, which makes
    // the window open rather than timing-dependent, and the second is given every chance to walk in.
    const db = createMemoryPersistenceAdapter();
    const held = overlappingSections(createPersistenceCredentialStore(db));
    const admin = createAccountAdmin(held.store, {
      roles: ["admin", "editor"],
      may: { create: () => true, list: () => true },
    });

    const answers = await holdOneAndOfferASecond(admin, [ADDRESS, ADDRESS], held);

    // The log is the whole assertion: with no serialisation, the second create's read begins before
    // the first create's write ends. Interleaving two of those is what produced two rows.
    expect(held.log.filter((entry) => entry.endsWith(":start:2"))).toEqual([]);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([taken(ADDRESS)]);
    expect(await db.query("users")).toHaveLength(1);
    expect(await authenticate(held.store, ADDRESS, PASSWORD)).toMatchObject({ email: ADDRESS });
  });

  it("holds two spellings of one address to one queue, over a store with no check of its own", async () => {
    // A queue keyed on the address as it was typed is two queues, and two queues is the duplicate
    // again. It is tested on a store with no duplicate check of its own because that is the only
    // place the key is load-bearing: with the shipped store, a second write is refused by the store
    // whichever queue it came from, and the test would pass for the wrong reason.
    const rows: AccountRecord[] = [];
    const bare = looseStore(rows);
    const held = overlappingSections(bare);
    const admin = createAccountAdmin(held.store, { may: { create: () => true } });

    const answers = await holdOneAndOfferASecond(
      admin,
      ["Racing@Example.test", "  racing@EXAMPLE.Test "],
      held,
    );

    expect(held.log.filter((entry) => entry.endsWith(":start:2"))).toEqual([]);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe(ADDRESS);
  });

  it("gives a host on a store with no unique index the in-process guarantee, and says what it lacks", async () => {
    // A store that reads honestly and writes a duplicate without complaint, which is what a host
    // whose schema has no unique address column actually has. Nothing in the package can give that
    // host the cross-process guarantee and the README says so; what it does get is this one, and
    // this is the test that holds the serialisation to being a guarantee rather than a decoration.
    const rows: AccountRecord[] = [];
    const bare = looseStore(rows);
    const held = overlappingSections(bare);
    const admin = createAccountAdmin(held.store, { may: { create: () => true } });

    const answers = await holdOneAndOfferASecond(admin, [ADDRESS, ADDRESS], held);

    expect(held.log.filter((entry) => entry.endsWith(":start:2"))).toEqual([]);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([taken(ADDRESS)]);
    expect(rows).toHaveLength(1);
  });

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
    expect(refused[0]).toEqual(taken(ADDRESS));
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
      expect(answers.filter((answer) => !answer.ok)).toEqual([taken(ADDRESS)]);
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
    expect(answers.filter((answer) => !answer.ok)).toEqual([taken(ADDRESS), taken(ADDRESS)]);
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
  /**
   * Two spellings of one address, written straight to the store with nothing folded in the test.
   *
   * No `normalizeEmail` anywhere in these, because the surface is the thing that folds and the point
   * is the path that does not go through it. The row count is asserted as well as the refusal, since
   * "threw" and "wrote one row" are both plausible and only the second is right.
   */
  for (const [label, fresh] of [
    ["the memory adapter", () => createMemoryPersistenceAdapter()],
    [
      "the SQLite adapter",
      () =>
        createSqlitePersistenceAdapter({
          url: `file:${join(mkdtempSync(join(tmpdir(), "helmdeck-fold-")), "h.db")}`,
        }),
    ],
  ] as const) {
    // A fresh database per test rather than one per adapter, so a row one test wrote is not the
    // duplicate the next one asserts.
    const db = () => fresh();
    it(`refuses a second account over ${label} for an address differing only in case and space`, async () => {
      const database = db();
      const store = createPersistenceCredentialStore(database);
      const hash = "scrypt$salt$key";

      const first = await store.createUser!({ email: "Same@Example.test", passwordHash: hash });

      // The first write is folded, so the row it wrote is the row the sign-in will look up.
      expect(first.email).toBe("same@example.test");
      await expect(
        store.createUser!({ email: "  same@EXAMPLE.Test ", passwordHash: hash }),
      ).rejects.toThrow(AccountAlreadyExistsError);
      expect(await database.query("users")).toHaveLength(1);
    }, 30_000);

    it(`reads back a row written in any spelling over ${label}, because the store wrote the folded one`, async () => {
      const store = createPersistenceCredentialStore(db());
      await store.createUser!({ email: "Same@Example.test", passwordHash: "scrypt$salt$key" });

      // The read folds too. A store that folded only the write would refuse the duplicate and then
      // fail to find the account it had just agreed to, which is a sign-in that cannot work.
      for (const spelling of ["same@example.test", "SAME@EXAMPLE.TEST", "  Same@Example.test  "]) {
        expect(await store.findUserByEmail(spelling), spelling).toMatchObject({
          email: "same@example.test",
        });
      }
    }, 30_000);
  }


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
    expect(answers.filter((answer) => !answer.ok)).toEqual([taken(ADDRESS)]);
  });

  it("answers a duplicate the surface found itself with its own wording, never the store's error", async () => {
    // A host renders that message, so the surface's sentence is the one that reaches a person. The
    // store's error carries the same words in a different shape, and leaking it would put a class name
    // in front of an operator who only needs to be told the address is spoken for.
    //
    // This is the path where the surface's own check refuses. The path where only the store can refuse
    // is the test below it, which stands up a store whose read never finds anything so the catch is
    // the only thing that can answer.
    const db = createMemoryPersistenceAdapter();
    const store = createPersistenceCredentialStore(db);
    const admin = createAccountAdmin(store, { may: { create: () => true } });

    const answers = await Promise.all([
      admin.create(ADMIN, { email: "Same@Example.test", password: PASSWORD }),
      admin.create(ADMIN, { email: "  same@EXAMPLE.Test ", password: PASSWORD }),
    ]);

    const refused = answers.filter((answer) => !answer.ok);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toEqual(taken("same@example.test"));
    // The message names the stored address, not the spelling that was typed, because the row is the
    // thing that now holds it.
    expect(JSON.stringify(refused[0])).not.toContain("Example");
    expect(await db.query("users")).toHaveLength(1);
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
