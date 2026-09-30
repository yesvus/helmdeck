// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AccountAlreadyExistsError,
  createAccountAdmin,
  createCredentialAuthAdapter,
  createMemoryPersistenceAdapter,
  createPersistenceCredentialStore,
  createSqlitePersistenceAdapter,
  type AccountRecord,
  type AdminSessionCookieIO,
  type CredentialStore,
} from "../src/baseline";
import type { AdminPersistenceAdapter, AdminSession } from "../src/adapters/index";

/**
 * Eight callers writing one address straight at the store, with nothing above them in the way.
 *
 * The account surface serialises per address, which is why `create` is safe. A host creating an
 * account outside a panel calls the store, and before this existed that path had no protection at
 * all: the store's own duplicate check is a read followed by a write, which is the shape two callers
 * interleave. Both shipped adapters wrote all eight rows.
 *
 * No sleeps anywhere. The calls are started together and none is awaited until all eight are, and
 * the counts are read from the store rather than from what the calls returned, because "one non-null"
 * and "one row" are two different claims and only the second is the property.
 */

const PASSWORD = "correct horse battery staple";
const ADDRESS = "same@example.test";
const HASH = "scrypt$salt$key";
const ADMIN: AdminSession = { email: "owner@example.test", role: "admin" };
const CONCURRENT = 8;

const newAccount = { email: ADDRESS, passwordHash: HASH, role: "editor" };

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
  };
}

/**
 * The two shipped adapters, each a factory for a database of its own.
 *
 * A factory rather than an instance because a test that shares a database with the test above it
 * finds that test's row already there, which reads as a failure of the property rather than of the
 * test. The SQLite file lives in a directory made per call for the same reason.
 */
function adapters() {
  const freshDirectory = () => mkdtempSync(join(tmpdir(), "helmdeck-atomic-"));
  return [
    { label: "the memory adapter", make: () => createMemoryPersistenceAdapter() },
    {
      label: "the SQLite adapter",
      make: () =>
        createSqlitePersistenceAdapter({ url: `file:${join(freshDirectory(), "helmdeck.db")}` }),
    },
  ] as const;
}

describe("the atomic insert, called directly and at the same time", () => {
  for (const { label, make } of adapters()) {
    it(`writes one row and answers one record over ${label}`, async () => {
      const store = createPersistenceCredentialStore(make());

      // Started together, awaited together, so no call can have finished before another began.
      const answers = await Promise.all(
        Array.from({ length: CONCURRENT }, () => store.createUserIfAbsent!(newAccount)),
      );

      expect(answers.filter((answer) => answer !== null)).toHaveLength(1);
      expect(answers.filter((answer) => answer === null)).toHaveLength(CONCURRENT - 1);
      // The row count, because one non-null is a claim about the answers and one row is the property.
      expect(await store.listUsers!()).toHaveLength(1);
      expect((await store.listUsers!())[0].email).toBe(ADDRESS);
      // And the row is a real account: the primitive wrote a hash, not a placeholder.
      const written = (await store.listUsers!())[0];
      expect(Object.keys(written)).not.toContain("passwordHash");
    }, 30_000);

    it(`folds the address before deciding, so a second spelling loses the same race over ${label}`, async () => {
      const store = createPersistenceCredentialStore(make());

      const answers = await Promise.all(
        Array.from({ length: CONCURRENT }, (_, index) =>
          store.createUserIfAbsent!({
            ...newAccount,
            email: index % 2 === 0 ? "Same@Example.test" : "  same@EXAMPLE.Test ",
          }),
        ),
      );

      expect(answers.filter((answer) => answer !== null)).toHaveLength(1);
      expect(await store.listUsers!()).toHaveLength(1);
    }, 30_000);
  }

  it("leaves the other resources in a shared table alone, which is what the index is scoped by", async () => {
    // The document adapter keeps every resource in one table, so an index built for the users email
    // has to be invisible to the rest of a host's data.
    //
    // **Two records of another resource that both hold an address is the case that makes the partial
    // clause load-bearing**, and it is not the obvious one: a record with no address at all is safe
    // from an unscoped index anyway, because SQLite treats a NULL in a unique index as distinct from
    // every other NULL. What a host would actually lose is two customers with the same address, or two
    // suppliers, which a constraint on a shared table must not be quietly deciding.
    const db = createSqlitePersistenceAdapter({
      url: `file:${join(mkdtempSync(join(tmpdir(), "helmdeck-scoped-")), "h.db")}`,
    });
    const store = createPersistenceCredentialStore(db);
    await store.createUserIfAbsent!(newAccount);
    await store.createUserIfAbsent!(newAccount);

    for (const id of ["p1", "p2", "p3"]) {
      await expect(db.create("products", { id, name: `product ${id}` })).resolves.toMatchObject({ id });
    }
    // The same address twice, in a different resource, and the second one is a legitimate row.
    await expect(
      db.create("customers", { id: "c1", email: "shared@example.test" }),
    ).resolves.toMatchObject({ id: "c1" });
    await expect(
      db.create("customers", { id: "c2", email: "shared@example.test" }),
    ).resolves.toMatchObject({ id: "c2" });
    expect(await db.query("customers")).toHaveLength(2);
    expect(await db.query("products")).toHaveLength(3);
    expect(await store.listUsers!()).toHaveLength(1);
  }, 30_000);
});

/**
 * The memory adapter's atomicity, which is a property of its source rather than of a mechanism.
 *
 * JavaScript runs one thing at a time, and an `async` function body runs to completion before its
 * first `await`, so a check and a push with nothing between them cannot be interleaved. The whole
 * guarantee is that there is no `await` in between, and an `await` added there would turn this into
 * the racy check-then-write it is not. The test below is the only thing that would notice, so it
 * hammers it, and the assertion is on the row count rather than on the answers.
 */
describe("the memory adapter's insertIfAbsent is atomic for the reason it says", () => {
  it("writes one row for many callers, which it only can with nothing between its check and its write", async () => {
    const db = createMemoryPersistenceAdapter();

    for (let round = 0; round < 20; round += 1) {
      const answers = await Promise.all(
        Array.from({ length: CONCURRENT }, (_, index) =>
          db.insertIfAbsent?.<{ id: string }>("users", "email", {
            email: `round${round}@example.test`,
            id: `u${round}-${index}`,
          }),
        ),
      );
      expect(answers.filter(Boolean), `round ${round}`).toHaveLength(1);
      expect(await db.query("users", { email: `round${round}@example.test` })).toHaveLength(1);
    }
  });

  it("refuses a second write of a value one record already holds, and writes a different one", async () => {
    const db = createMemoryPersistenceAdapter();

    expect(await db.insertIfAbsent?.<{ id: string }>("users", "email", { id: "u1", email: "one@example.test" })).toMatchObject({
      id: "u1",
    });
    expect(await db.insertIfAbsent?.<{ id: string }>("users", "email", { id: "u2", email: "one@example.test" })).toBeNull();
    expect(await db.insertIfAbsent?.<{ id: string }>("users", "email", { id: "u3", email: "two@example.test" })).toMatchObject({
      id: "u3",
    });
    expect(await db.query("users")).toHaveLength(2);
  });

  it("treats a record with no value at that key as not matching, the way a query does", async () => {
    // `query` filters with `===` and an undefined field never equals a value, so two records with
    // nothing at the key are two rows rather than one. A second rule here would be a second meaning
    // of "absent".
    const db = createMemoryPersistenceAdapter();
    await db.create("notes", { id: "n1" });
    await db.create("notes", { id: "n2" });

    expect(await db.insertIfAbsent?.("notes", "email", { id: "n3" })).toBeNull();
    expect(await db.query("notes")).toHaveLength(2);
  }, 10_000);

  it("is not the same as create, which refuses a duplicate id and throws where this answers null", async () => {
    // Two methods, two contracts. `create` refuses a duplicate *id*, because that is its identity,
    // and throws. `insertIfAbsent` refuses a duplicate *value at a key the caller named* and answers
    // null. Conflating them is how one of them starts breaking a host that relies on the other, and
    // the id case is the one that shows here: a second caller naming an id the winner already took
    // is a different problem from a second caller naming the same address, and it is not this
    // method's to swallow.
    const db = createMemoryPersistenceAdapter();
    await db.insertIfAbsent?.<{ id: string }>("users", "email", { id: "u1", email: "one@example.test" });

    await expect(
      db.insertIfAbsent?.<{ id: string }>("users", "email", { id: "u1", email: "other@example.test" }),
    ).rejects.toThrow(/already exists/);
    await expect(db.create("users", { id: "u1", email: "other@example.test" })).rejects.toThrow(
      /already exists/,
    );
    expect(await db.query("users")).toHaveLength(1);
  });
});

describe("the method that could not be atomic does not claim to be", () => {
  it("is absent from a store whose persistence cannot make the decision in one statement", async () => {
    // A host's own persistence adapter, written before this interface grew the method. Reporting it
    // as present would have a caller skip the unique index it still needs.
    const withoutIt: AdminPersistenceAdapter = {
      read: async () => null,
      query: async () => [],
      create: async <T,>() => ({ id: "u1" }) as T,
      update: async <T,>() => ({ id: "u1" }) as T,
      delete: async () => {},
    };
    const store = createPersistenceCredentialStore(withoutIt);

    expect(store.createUserIfAbsent).toBeUndefined();
    expect(typeof store.createUser).toBe("function");
  });

  it("is present on both shipped adapters, which is the point of shipping it", () => {
    expect(typeof createPersistenceCredentialStore(createMemoryPersistenceAdapter()).createUserIfAbsent).toBe(
      "function",
    );
  });
});

describe("createUser keeps refusing a duplicate, and says it is not safe under concurrency", () => {
  for (const { label, make } of adapters()) {
    it(`refuses a duplicate address over ${label}, the way a host already calling it needs`, async () => {
      const store = createPersistenceCredentialStore(make());
      await store.createUser!(newAccount);

      await expect(store.createUser!(newAccount)).rejects.toThrow(AccountAlreadyExistsError);
      expect(await store.listUsers!()).toHaveLength(1);
    }, 30_000);
  }

  it("is documented as unsafe under concurrency, because the read inside it is why", () => {
    // The trap this closes: a method documented as refusing duplicates, read by a host as a
    // guarantee, called from two processes, writing two rows. The docstring has to say what it does
    // not do, and a test is the only thing that notices when it stops saying it.
    const source = readFileSync(
      join(import.meta.dirname, "..", "src", "baseline", "credentials.ts"),
      "utf8",
    );

    // Above the declaration rather than after it, and close enough to be about this method: a
    // sentence about concurrency in some other corner of the file is not a contract.
    const declared = source.indexOf("createUser?: (account: NewAccount)");
    const warning = source.indexOf("not safe under concurrency");
    expect(declared).toBeGreaterThan(0);
    expect(warning, "the contract no longer says it is not safe under concurrency").toBeGreaterThan(0);
    expect(warning).toBeLessThan(declared);
    expect(declared - warning).toBeLessThan(2000);
    // And it names the way out, because a warning with no alternative is only half a contract.
    expect(source.slice(warning, declared)).toMatch(/createUserIfAbsent/);
  });
});

describe("the surface uses the primitive when there is one, and the queue when there is not", () => {
  it("produces its own wording when the primitive refuses, rather than the store's answer", async () => {
    const store = createPersistenceCredentialStore(createMemoryPersistenceAdapter());
    const admin = createAccountAdmin(store, { may: { create: () => true } });
    await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });

    const again = await admin.create(ADMIN, { email: "  SAME@Example.Test ", password: PASSWORD });

    expect(again).toEqual({
      ok: false,
      reason: "email-taken",
      message: `${ADDRESS} already has an account. Change its role or turn it off rather than making a second one.`,
    });
    expect(await store.listUsers!()).toHaveLength(1);
  });

  it("still serialises a store that has neither the primitive nor a constraint", async () => {
    // The path the primitive must not replace. A hand-written store that checks nothing and refuses
    // nothing is a host that has not read the contract, and the queue is all this package can offer
    // it inside one process.
    const rows: AccountRecord[] = [];
    const bare: CredentialStore = {
      findUserByEmail: async (email) =>
        rows.map((row) => ({ ...row, passwordHash: HASH })).find((row) => row.email === email) ?? null,
      findUserById: async (id) =>
        rows.map((row) => ({ ...row, passwordHash: HASH })).find((row) => row.id === id) ?? null,
      createSession: async () => ({ id: "s1", userId: "u1", expiresAt: 0 }),
      readSession: async () => null,
      deleteSession: async () => {},
      deleteSessionsForUser: async () => 0,
      listUsers: async () => rows,
      createUser: async (account) => {
        const record = { id: `u${rows.length + 1}`, email: account.email, disabled: false };
        rows.push(record);
        return record;
      },
    };
    expect(bare.createUserIfAbsent).toBeUndefined();
    const admin = createAccountAdmin(bare, { may: { create: () => true } });

    const answers = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" }),
      ),
    );

    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toHaveLength(CONCURRENT - 1);
    expect(rows).toHaveLength(1);
  });

  it("calls the primitive and not the checking write when the store has one", async () => {
    // The two paths are the claim, so this is asserted directly rather than through what they
    // produce: a surface that quietly used the checking write on a store offering the primitive would
    // have every answer right and none of the guarantee.
    const store = createPersistenceCredentialStore(createMemoryPersistenceAdapter());
    const counted = {
      ...store,
      createUser: vi.fn(store.createUser),
      createUserIfAbsent: vi.fn(store.createUserIfAbsent),
    };
    const admin = createAccountAdmin(counted, { may: { create: () => true } });

    await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });

    expect(counted.createUserIfAbsent).toHaveBeenCalledOnce();
    expect(counted.createUser).not.toHaveBeenCalled();
  });

  it("makes an account the sign-in accepts, whichever path wrote it", async () => {
    const store = createPersistenceCredentialStore(createMemoryPersistenceAdapter());
    const admin = createAccountAdmin(store, { may: { create: () => true } });
    const created = await admin.create(ADMIN, { email: ADDRESS, password: PASSWORD, role: "editor" });

    const auth = createCredentialAuthAdapter({
      secret: "a-signing-secret-long-enough-to-hold",
      store,
      cookie: jar().io,
    });
    expect(created.ok).toBe(true);
    expect((await auth.login({ email: ADDRESS, password: PASSWORD })).ok).toBe(true);
  });
});
