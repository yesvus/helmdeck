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
// By name, never by path into ../../src. A path import compiles library source into this build, and
// Turbopack never turns a `.js` specifier into a `.ts` file, so the adapter's own imports stop
// resolving the moment one of them needs a value rather than only a type.
import { createMemoryPersistenceAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";

/**
 * The environment, as this module reads it.
 *
 * `Record<string, string | undefined>` rather than `NodeJS.ProcessEnv`, for the reason
 * `payload-db.ts` already records: Next augments the latter with a **required** `NODE_ENV`, so a test
 * passing `{ HELMDECK_TURSO_URL: "..." }` would be a type error over a variable this module never looks
 * at. That pushed the tests toward casts, and a cast is how a test stops checking what it was given.
 */
type DemoEnv = Record<string, string | undefined>;

export type DemoPersistence = {
  adapter: AdminPersistenceAdapter;
  /** Which store answered, so a page can say so and a test can assert it. */
  kind: "turso" | "memory";
  /**
   * The client behind the adapter, for the one caller that needs to speak SQL rather than resources:
   * the migration runner. Absent in memory, where there is no schema to bring up to date.
   */
  sql?: SqlClient;
};

function fromEnvironment(env: DemoEnv = process.env): DemoPersistence {
  const url = env.HELMDECK_TURSO_URL;
  const authToken = env.HELMDECK_TURSO_TOKEN;

  if (url && authToken) {
    const client = createClient({ url, authToken });
    return {
      adapter: createTursoPersistenceAdapter(client as unknown as SqlClient),
      kind: "turso",
      sql: client as unknown as SqlClient,
    };
  }

  return { adapter: createMemoryPersistenceAdapter() as AdminPersistenceAdapter, kind: "memory" };
}

let cached: DemoPersistence | null = null;

export function demoPersistence(): DemoPersistence {
  cached ??= fromEnvironment();
  return cached;
}

/**
 * Whether this process must have a database, as opposed to being allowed an in-memory one.
 *
 * Absence of configuration is legitimate and must not stop a local run or a build, so the question is
 * not "is the database configured" but "is this a deployment that would look identical either way".
 *
 * **`VERCEL` carries it, which means the demo cannot be deployed into this failure by forgetting
 * something.** The alternative, a variable a maintainer has to remember to set, is a setting that
 * protects nothing on the day it is forgotten, which is the day it is needed. A deployment that loses
 * `HELMDECK_TURSO_URL` has not lost `VERCEL`, so it refuses.
 *
 * `HELMDECK_DEMO_REQUIRE_DATABASE` is the host-neutral escape hatch, for a deployment on a platform that
 * does not set `VERCEL` and for a test that wants the deployed behaviour without a real deployment.
 *
 * **A production build is not a deployment.** `next build` runs with `VERCEL` set and the database
 * deliberately absent, which is how this repository proves every admin page is dynamic, so refusing there
 * would fail every build on the platform that hosts the demo. `NEXT_PHASE` separates the two:
 * `phase-production-build` while building, `phase-production-server` while serving.
 *
 * Today nothing reaches this during a build, because every page is dynamic and no static page touches
 * persistence. That is a property of how the pages happen to be written rather than something the guard
 * enforces, and it would change silently: the first static page that reads a store would turn every Vercel
 * build red, and it would read as a database problem rather than as a page that was made static by
 * accident. Excluding the phase here means that mistake costs a page instead of the deployment.
 */
export function demoPersistenceRequired(env: DemoEnv = process.env): boolean {
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.HELMDECK_DEMO_REQUIRE_DATABASE) return true;
  return Boolean(env.VERCEL);
}

/** For a deployed demo, where quietly serving memory would look identical to a working database. */
export function assertDemoPersistenceConfigured(env: DemoEnv = process.env) {
  if (env.HELMDECK_TURSO_URL && env.HELMDECK_TURSO_TOKEN) return;
  throw new Error(
    "HELMDECK_TURSO_URL and HELMDECK_TURSO_TOKEN are not set. A deployed demo must not fall back to " +
      "an in-memory store, because it behaves like a database and loses every write on restart.",
  );
}
