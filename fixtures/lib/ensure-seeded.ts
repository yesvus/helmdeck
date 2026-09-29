// SPDX-License-Identifier: MIT
import { DEMO_PASSWORD } from "./demo-accounts";
import { demoPersistence } from "./demo-persistence";
import { seedDemo } from "./seed";

/**
 * Makes sure the store holds the demo's records, once per process.
 *
 * The resource pages read through persistence now rather than from a hardcoded array, so a store
 * nobody has seeded renders an empty table, which is indistinguishable from a demo that has no data.
 * Login never noticed this because the accounts are built in code from `seedUsers`, so the one page
 * anyone would test first worked while the pages behind it would have been blank.
 *
 * Memoised rather than run per request: seeding is idempotent on both stores, but idempotent is not
 * the same as free, and paying a read per group on every navigation to prove it would be a poor
 * trade. A failure clears the memo, so one refused connection does not leave the process believing
 * the store is seeded when it never was.
 */
let seeded: Promise<void> | null = null;

export function ensureDemoSeeded(): Promise<void> {
  seeded ??= seedDemo(demoPersistence().adapter, DEMO_PASSWORD).then(
    () => undefined,
    (cause: unknown) => {
      seeded = null;
      throw cause;
    },
  );
  return seeded;
}
