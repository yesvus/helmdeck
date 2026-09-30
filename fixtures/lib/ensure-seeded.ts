// SPDX-License-Identifier: MIT
import { DEMO_PASSWORD } from "./demo-accounts";
import { demoPersistence } from "./demo-persistence";
import { migrateDemo } from "./migrate";
import { seedDemo } from "./seed";

/**
 * Makes sure the database has the schema the code reads, and then the demo's records, once per process.
 *
 * The resource pages read through persistence now rather than from a hardcoded array, so a store
 * nobody has seeded renders an empty table, which is indistinguishable from a demo that has no data.
 * Login never noticed this because the accounts are built in code from `seedUsers`, so the one page
 * anyone would test first worked while the pages behind it would have been blank.
 *
 * Migrations run first and unconditionally, and that ordering is the whole point of this function
 * existing separately from `seedDemo`: the seed writes twelve resources across six tables, so a
 * database missing one of them fails the seed, and a failure here fails every request including
 * sign-in. Seven migration files sat unapplied for exactly that reason, and the demo was entirely
 * unreachable while the seed reported a missing table rather than a missing runner.
 *
 * Memoised rather than run per request: seeding is idempotent on both stores, and migrations are
 * idempotent by construction, but idempotent is not the same as free, and paying a read per group on
 * every navigation to prove it would be a poor trade. A failure clears the memo, so one refused
 * connection does not leave the process believing the work is done when it never was.
 */
let ready: Promise<void> | null = null;

export function ensureDemoSeeded(): Promise<void> {
  ready ??= (async () => {
    const { adapter, sql } = demoPersistence();
    if (sql) await migrateDemo(sql);
    await seedDemo(adapter, DEMO_PASSWORD);
  })().then(
    () => undefined,
    (cause: unknown) => {
      ready = null;
      throw cause;
    },
  );
  return ready;
}
