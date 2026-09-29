// SPDX-License-Identifier: MIT

/**
 * The demo's persistence, selected at run time.
 *
 * Turso when the environment supplies it, the in-memory adapter otherwise. One code path in the
 * demo, and no `if (isDev)` in feature code: a branch inside a feature is how a demo ends up writing
 * to a different store than the one it was tested against, and nothing about that is visible from
 * outside.
 *
 * Absent configuration is a legitimate state, not an error. CI and local development run without a
 * database, and a missing variable must not stop the suite. A deployed demo, though, must not
 * silently serve an in-memory store that looks real, so `assertDemoPersistenceConfigured` exists for
 * the place that can afford to insist.
 */

import { createClient } from "@libsql/client";
import { createTursoPersistenceAdapter, type SqlClient } from "./turso-persistence";
import { createMemoryPersistenceAdapter } from "../../src/baseline/memory";
import type { AdminPersistenceAdapter } from "../../src/adapters/host";

export type DemoPersistence = {
  adapter: AdminPersistenceAdapter;
  /** Which store answered, so a page can say so and a test can assert it. */
  kind: "turso" | "memory";
};

function fromEnvironment(env: NodeJS.ProcessEnv = process.env): DemoPersistence {
  const url = env.HELMDECK_TURSO_URL;
  const authToken = env.HELMDECK_TURSO_TOKEN;

  if (url && authToken) {
    const client = createClient({ url, authToken });
    return { adapter: createTursoPersistenceAdapter(client as unknown as SqlClient), kind: "turso" };
  }

  return { adapter: createMemoryPersistenceAdapter() as AdminPersistenceAdapter, kind: "memory" };
}

let cached: DemoPersistence | null = null;

export function demoPersistence(): DemoPersistence {
  cached ??= fromEnvironment();
  return cached;
}

/** For a deployed demo, where quietly serving memory would look identical to a working database. */
export function assertDemoPersistenceConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.HELMDECK_TURSO_URL && env.HELMDECK_TURSO_TOKEN) return;
  throw new Error(
    "HELMDECK_TURSO_URL and HELMDECK_TURSO_TOKEN are not set. A deployed demo must not fall back to " +
      "an in-memory store, because it behaves like a database and loses every write on restart.",
  );
}
