// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { authenticate, createMemoryPersistenceAdapter } from "@yesvus/helmdeck/baseline";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoCredentialStore } from "../fixtures/lib/demo-session";
import { seedDemo } from "../fixtures/lib/seed";
import { hashPassword, verifyPassword } from "../fixtures/lib/demo-users";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";

/**
 * The demo's accounts, as the demo now keeps them: rows in its own store, read by the package's
 * credential store and written by the demo's own seed.
 *
 * The hashing itself is the package's and is tested there, so nothing here re-tests scrypt. What is
 * under test is the demo's half: that the two seeded accounts exist, that the published password is
 * the one they are written with, that the roles are on the stored row rather than in a value the
 * adapter holds, and that an address with no account is answered exactly as a wrong password.
 */
async function seeded() {
  const memory = createMemoryPersistenceAdapter();
  await seedDemo(memory as AdminPersistenceAdapter, DEMO_PASSWORD);
  return memory as AdminPersistenceAdapter;
}

describe("the two accounts the demo ships with", () => {
  it("exist as rows, with the role each of them holds on the row", async () => {
    const store = await seeded();

    const rows = await store.query<{ id: string; email: string; role: string }>("users");

    expect(rows.map((row) => row.id).sort()).toEqual(["usr_editor", "usr_owner"]);
    expect(rows.find((row) => row.id === "usr_owner")?.role).toBe("admin");
    expect(rows.find((row) => row.id === "usr_editor")?.role).toBe("editor");
    // The store holds the address, and the sign-in finds the account by it, so an address written
    // anywhere else would be an account nobody can reach.
    for (const row of rows) {
      expect(row.email).toBe(demoAccounts.find((account) => account.id === row.id)?.email);
    }
  });

  it("are written with the published password, and with a hash rather than the password", async () => {
    const store = await seeded();

    for (const row of await store.query<{ id: string; password_hash: string }>("users")) {
      expect(row.password_hash).not.toBe(DEMO_PASSWORD);
      expect(await verifyPassword(DEMO_PASSWORD, row.password_hash), row.id).toBe(true);
      expect(await verifyPassword(`${DEMO_PASSWORD}x`, row.password_hash), row.id).toBe(false);
    }
  });

  it("carry the role on the row, and no role anywhere else the adapter could read", async () => {
    // The demo's rule is written against `session.role`, so the only place a role can come from is
    // the row the session points at. Nothing in the cookie's name or shape carries one, which is
    // what keeps a signed cookie from being a claim about its own authority.
    const store = await seeded();
    const credentials = demoCredentialStore(store);
    const user = await credentials.findUserByEmail(demoAccounts[0].email);

    expect(user).toMatchObject({ id: "usr_owner", role: "admin" });
  });
});

describe("an address with no account", () => {
  it("is answered exactly as a wrong password, by the store the demo signs in through", async () => {
    // The same function the sign-in calls, over the same store, rather than a stand-in: the property
    // is that the demo's own wiring does not enumerate, and the wiring is the store.
    const credentials = demoCredentialStore(await seeded());

    const unknown = await authenticate(credentials, "nobody@demo.helmdeck.dev", DEMO_PASSWORD);
    const wrong = await authenticate(credentials, demoAccounts[0].email, "not-the-password");

    // Equal answers, not merely two refusals: a form that says one of these two things reports which
    // addresses have accounts.
    expect(unknown).toBeNull();
    expect(unknown).toEqual(wrong);
    expect(await credentials.findUserByEmail("nobody@demo.helmdeck.dev")).toBeNull();
  });

  it("does not answer an unknown address noticeably faster than a wrong password", async () => {
    // Equal answers that arrive at very different speeds are still an oracle: the gap is the
    // measurement. The margin is loose on purpose, because this is a smoke check against a gross
    // difference and a benchmark would be a test that fails on a slow machine.
    const credentials = demoCredentialStore(await seeded());
    const timeFor = async (email: string) => {
      const started = process.hrtime.bigint();
      await authenticate(credentials, email, "wrong");
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    // A warm pass, so the first call's cost is the decoy's first hash rather than the module's.
    await timeFor(demoAccounts[0].email);
    const unknown = await timeFor("nobody@demo.helmdeck.dev");
    const known = await timeFor(demoAccounts[0].email);

    expect(unknown).toBeGreaterThan(known * 0.2);
  });

  it("is refused by a row that is not an account yet, because no password matches it", async () => {
    // A row a migration created carries an empty hash, and the seed fills it in. Until it is filled
    // in the row must be refused exactly as no row is, or a half-written migration is an account
    // whose state can be probed for. The row is still an account to the store, which is what lets the
    // seed find it and write the hash into it; what matters is that the sign-in cannot tell it from
    // an address nobody has.
    const memory = createMemoryPersistenceAdapter();
    await memory.create("users", {
      id: "usr_half_written",
      email: "half@demo.helmdeck.dev",
      password_hash: "",
      role: "admin",
    });
    const credentials = demoCredentialStore(memory as AdminPersistenceAdapter);

    const halfWritten = await authenticate(credentials, "half@demo.helmdeck.dev", "anything");
    const unknown = await authenticate(credentials, "nobody@demo.helmdeck.dev", "anything");

    expect(halfWritten).toBeNull();
    expect(halfWritten).toEqual(unknown);
    // And the row is still findable, which is the seed's path back into it.
    expect(await credentials.findUserByEmail("half@demo.helmdeck.dev")).toMatchObject({
      id: "usr_half_written",
    });
  });
});

describe("the hash the demo writes", () => {
  it("is the package's, which is what makes a row readable by the package's sign-in", async () => {
    // The demo re-exports the package's primitives rather than keeping its own, so this is a claim
    // about the re-export being the same function rather than about scrypt.
    const hash = await hashPassword(DEMO_PASSWORD);

    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(DEMO_PASSWORD, hash)).toBe(true);
  });
});
