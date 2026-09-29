// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { seedDemo } from "../fixtures/lib/seed";
import { verifyPassword } from "../fixtures/lib/demo-users";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";

/**
 * The seed is documented as idempotent and the live database check proves it twice over, but only
 * against Turso, where a supplied id is the id that gets stored. The in-memory store is the path CI
 * and local development take, and it regenerated ids, so a second pass could not find the first
 * pass's rows and wrote every one of them again. Doubling the seed on each run looks, from outside,
 * exactly like a store working correctly, which is why the check that would have caught it was
 * running against the other store.
 */
describe("seedDemo", () => {
  it("adds nothing on a second pass over the in-memory store", async () => {
    const db = createMemoryPersistenceAdapter();

    const first = await seedDemo(db as never, "correct horse battery staple");
    const second = await seedDemo(db as never, "correct horse battery staple");

    const counts = async () => ({
      users: (await db.query("users")).length,
      posts: (await db.query("posts")).length,
      products: (await db.query("products")).length,
      orders: (await db.query("orders")).length,
      dashboard_placements: (await db.query("dashboard_placements")).length,
    });

    const afterFirst = await counts();
    expect(Object.values(afterFirst).every((count) => count > 0)).toBe(true);

    expect(second.created).toEqual({});
    expect(await counts()).toEqual(afterFirst);
    expect(first.created).not.toEqual({});
  });

  /**
   * The role is read off the stored user row by the authorization rule, so a seed that writes it
   * back on every process start makes the column a value that only survives until the next restart.
   * Nothing looks wrong while it happens: the row still has a valid role, the account still signs
   * in, and the refusal that was tested the day before quietly stops applying.
   */
  it("leaves a role that was changed in the store alone on the next pass", async () => {
    const db = createMemoryPersistenceAdapter();

    await seedDemo(db as never, "correct horse battery staple");
    const before = await db.read("users", "usr_editor");
    expect((before as { role?: unknown }).role).toBe("editor");

    await db.update("users", "usr_editor", { ...(before as object), role: "admin" });
    await seedDemo(db as never, "correct horse battery staple");

    const after = await db.read("users", "usr_editor");
    expect((after as { role?: unknown }).role).toBe("admin");
  });

  it("still writes the password hash on a pass that leaves the role alone", async () => {
    // The fix above keeps the role and nothing else. A seed that skipped the whole update to achieve
    // that would stop rotating the hash, and a rotated hash is what keeps a published demo password
    // from being a permanent one. The hash is salted per call, so it is verified rather than
    // compared: two calls to hashPassword never return the same string even for one password.
    const db = createMemoryPersistenceAdapter();

    await seedDemo(db as never, "first password");
    const rotated = await seedDemo(db as never, "second password");

    expect(rotated.updated.users).toBeGreaterThan(0);
    const after = (await db.read("users", "usr_owner")) as { password_hash?: unknown };
    expect(typeof after.password_hash).toBe("string");
    expect(await verifyPassword("second password", String(after.password_hash))).toBe(true);
    expect(await verifyPassword("first password", String(after.password_hash))).toBe(false);
  });
});
