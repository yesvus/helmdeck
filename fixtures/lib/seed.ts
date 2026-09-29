// SPDX-License-Identifier: MIT

/**
 * Populating the demo with a realistic workspace.
 *
 * Idempotent by id: seeding twice leaves the same rows rather than duplicating a workspace, which
 * matters because a deploy runs migrations and seeding, and a demo that doubled its orders on every
 * deploy would stop being credible within a week.
 *
 * A row whose constraints the seed itself violates is a failure, not a warning. The seed is checked
 * against the same database the demo reads, so a typo in a SKU surfaces here rather than as a demo
 * missing an item.
 */

import { seedEverything } from "./seed-data";
import type { AdminPersistenceAdapter } from "../../src/adapters/host";
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
    const record = { ...user, password_hash: hash };
    const existing = await adapter.read("users", user.id);
    if (existing) {
      await adapter.update("users", user.id, record);
      result.updated.users = (result.updated.users ?? 0) + 1;
    } else {
      await adapter.create("users", record);
      result.created.users = (result.created.users ?? 0) + 1;
    }
  }

  const groups: Array<[string, readonly { id: string }[]]> = [
    ["posts", seedEverything.posts],
    ["products", seedEverything.products],
    ["orders", seedEverything.orders],
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
