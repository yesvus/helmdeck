// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { seedDemo } from "../fixtures/lib/seed";
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
});
