// SPDX-License-Identifier: MIT

/**
 * Populating the demo with a realistic workspace.
 *
 * Idempotent by id: seeding twice leaves the same rows rather than duplicating a workspace, which
 * matters because a deploy runs migrations and seeding, and a demo that doubled its orders on every
 * deploy would stop being credible within a week. The landing page is the one group that is not
 * rewritten, because somebody's arrangement is a thing to keep rather than a record to refresh.
 *
 * A row whose constraints the seed itself violates is a failure, not a warning. The seed is checked
 * against the same database the demo reads, so a typo in a SKU surfaces here rather than as a demo
 * missing an item.
 */

import { seedEverything } from "./seed-data";
// By name, and this one is type-only so nothing fails today. That is exactly why it is worth
// changing: the moment a `src` file needs a value from a relative import rather than only a type,
// the fixture's build stops resolving it, and this line is where library source entered the graph.
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { hashPassword } from "./demo-users";

export type SeedResult = {
  created: Record<string, number>;
  updated: Record<string, number>;
};

/**
 * Populated in one pass rather than row by row.
 *
 * A seed is 18 rows against a remote database, and a round trip each is a seed that takes long enough
 * to be a suspect in any CI run. Rows are also written concurrently within a resource, because
 * nothing here depends on another row landing first.
 */
export async function seedDemo(
  adapter: AdminPersistenceAdapter,
  password: string,
): Promise<SeedResult> {
  const result: SeedResult = { created: {}, updated: {} };
  const hash = await hashPassword(password);

  for (const user of seedEverything.users) {
    const existing = await adapter.read("users", user.id);
    if (existing) {
      // The role belongs to the account, not to the seed. Authorization reads it off this row, so a
      // seed that wrote it back on every process start would make the stored role a value that only
      // survives until the next restart, and an operator's promotion would silently revert under
      // them. The migration that first inserts these rows takes the same view with INSERT OR IGNORE,
      // so the two agree on which one owns the column.
      const stored = (existing ?? {}) as { role?: unknown };
      await adapter.update("users", user.id, {
        ...user,
        password_hash: hash,
        role: typeof stored.role === "string" ? stored.role : user.role,
      });
      result.updated.users = (result.updated.users ?? 0) + 1;
    } else {
      await adapter.create("users", { ...user, password_hash: hash });
      result.created.users = (result.created.users ?? 0) + 1;
    }
  }

  /**
   * The landing page is seeded only while it is empty, which is the opposite rule to the groups above.
   *
   * Idempotent by id means "if I know this record, write it again from the seed", which is what a
   * catalogue of products wants and what an arrangement must not have: the demo's whole claim is that
   * an edit survives a reload, and a seed that put the sections back would make that untrue on any
   * deployment where the next request is a different process. An empty page is seeded, an arranged one
   * is left alone, and a person who deletes every section gets an empty page rather than the seed.
   */
  const landing = await adapter.query<{ page: string }>("landing_sections");
  for (const page of new Set(seedEverything.landing_sections.map((row) => row.page))) {
    if (landing.some((row) => row.page === page)) continue;
    for (const row of seedEverything.landing_sections.filter((section) => section.page === page)) {
      await adapter.create("landing_sections", row);
      result.created.landing_sections = (result.created.landing_sections ?? 0) + 1;
    }
  }

  const groups: Array<[string, readonly { id: string }[]]> = [
    ["posts", seedEverything.posts],
    ["products", seedEverything.products],
    ["orders", seedEverything.orders],
    // Customers before the shipments that name them, because the two tables are joined by a
    // constraint the store enforces and a shipment written first would be refused for naming a row
    // that is not there yet.
    ["customers", seedEverything.customers],
    ["shipments", seedEverything.shipments],
    ["dashboard_placements", seedEverything.dashboard_placements],
  ];

  for (const [resource, rows] of groups) {
    // One read for the whole group, then the writes concurrently. Reading per row is what made this
    // a timeout, and it is also a round trip per row for a demo that nobody is waiting on.
    const existing = await adapter.query<{ id: string }>(resource);
    const known = new Set(existing.map((row) => row.id));

    const writes = await Promise.all(
      rows.map(async (row) => {
        if (known.has(row.id)) {
          await adapter.update(resource, row.id, row);
          return "updated" as const;
        }
        await adapter.create(resource, row);
        return "created" as const;
      }),
    );

    for (const outcome of writes) {
      result[outcome][resource] = (result[outcome][resource] ?? 0) + 1;
    }
  }

  return result;
}
