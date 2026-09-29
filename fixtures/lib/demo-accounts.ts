// SPDX-License-Identifier: MIT

import { hashPassword, type DemoUser } from "./demo-users";
import { seedUsers } from "./seed-data";

/**
 * The demo's accounts, seeded rather than registered.
 *
 * There is no sign-up. A public demo with real logins and a shared database would let anyone create
 * an account and write to a store someone else pays for, so the demo publishes one password and
 * hands the same workspace to everyone. A visitor who wants their own data forks the fixture.
 *
 * The hashes are generated here rather than pasted in, so they are real hashes of the documented
 * password and never a literal that could drift away from what the login page claims.
 */
export const DEMO_PASSWORD = "helmdeck-demo";

export type DemoAccount = {
  id: string;
  email: string;
  role: DemoUser["role"];
  note: string;
};

const notes: Record<DemoUser["role"], string> = {
  admin: "Everything, including ending every session.",
  editor: "The dashboard and content. No administration.",
};

/**
 * Taken from the seeded workspace rather than written out again, because a session row points at
 * `users(id)`: an account with an id the workspace has never heard of is a session referring to
 * nothing, and a login that works anyway is the kind of inconsistency nobody notices until the
 * foreign key refuses the insert.
 */
export const demoAccounts: readonly DemoAccount[] = seedUsers.map((user) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  note: notes[user.role],
}));

/**
 * Built once per process and memoised, because hashing is deliberately slow and the demo is read on
 * every request. In development a module reload would otherwise pay for it again.
 */
let cached: Promise<DemoUser[]> | null = null;

export function demoUsers(): Promise<DemoUser[]> {
  cached ??= Promise.all(
    demoAccounts.map(async (account) => ({
      id: account.id,
      email: account.email,
      role: account.role,
      passwordHash: await hashPassword(DEMO_PASSWORD),
    })),
  );
  return cached;
}
