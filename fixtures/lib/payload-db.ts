// SPDX-License-Identifier: MIT

/**
 * Where Payload's tables live: the same libsql database the demo's own rows are in.
 *
 * One store rather than two, because a demo that seeded a workspace into Turso and its content into
 * a SQLite file would show a person two databases with different fates. The environment names one
 * database, and both read it.
 *
 * The token is read here and nowhere else, and never written down: `HELMDECK_TURSO_TOKEN` is the
 * environment's, and this module's job is to hand it to the driver.
 *
 * Without the environment there is no database at all, so the demo falls back to a file beside the
 * fixtures. A local file rather than an in-memory URL, because Payload's schema has to survive the
 * process that created it and a memory store is empty the moment that process ends, which makes every
 * restart answer "no such table" for a configuration that is correct.
 */

import { sqliteAdapter, type SQLiteAdapterArgs } from "@payloadcms/db-sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The environment, as this module reads it.
 *
 * `Record<string, string | undefined>` rather than `NodeJS.ProcessEnv`, because Next augments the
 * latter with a **required** `NODE_ENV` and a test that passes `{ HELMDECK_TURSO_URL: "..." }` would be
 * a type error for a variable this module never looks at. Nothing here needs Next's augmentation.
 */
type PayloadEnv = Record<string, string | undefined>;

/**
 * Turso when the environment supplies it, a local file otherwise.
 *
 * The two are the same driver and the same schema, so a fresh clone exercises exactly the code a
 * deployed demo runs. What differs is only where the rows end up.
 */
export function payloadDatabaseClient(env: PayloadEnv = process.env): {
  url: string;
  authToken?: string;
} {
  // A suite or a second instance pointing Payload at its own file, without needing a token to open a
  // local database. Read before the Turso pair, because a test that set `HELMDECK_TURSO_URL` alone would
  // otherwise be silently ignored and would write to the developer's own file instead.
  const override = env.HELMDECK_PAYLOAD_DB_URL?.trim();
  if (override) return { url: override };

  const url = env.HELMDECK_TURSO_URL?.trim();
  const authToken = env.HELMDECK_TURSO_TOKEN?.trim();

  if (url && authToken) return { url, authToken };

  return { url: `file:${join(process.cwd(), "fixtures", "payload-demo.db")}` };
}

/**
 * The adapter's settings, built once so both the adapter and the tests read the same values.
 *
 * Exported rather than inlined in the adapter factory because two claims about this database are worth
 * asserting rather than trusting: that development schema pushing is off, and that ids are text. Both
 * are decisions with a consequence, and a test that re-declared them would prove nothing about the
 * config that actually runs.
 */
/**
 * Where Payload's generated migrations are, whichever of the three layouts this is running in.
 *
 * `process.cwd()` is the repository root in development and `/var/task` on Vercel, because the build sets
 * `outputDirectory: fixtures/.next`. Joining a path onto that assumes a layout, and this project has
 * already paid for that assumption twice: once for the demo's own migrations, where the deployed working
 * directory produced a bare `ENOENT` on a path nobody had ever seen, and once for a fixture elsewhere that
 * resolved to the wrong tree entirely. Both were deploy-time failures that no test caught, because neither
 * exists on a machine that is not the deployed one.
 *
 * So the candidates are tried and the first that is a directory wins, and when none is, the error names
 * every path that was tried. A missing file that says where it looked is a five-second fix.
 */
export function payloadMigrationsDir(cwd: string = process.cwd()): string {
  const candidates = [
    join(cwd, "fixtures", "payload-migrations"),
    join(cwd, "payload-migrations"),
    join(cwd, "lib", "payload-migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `Payload's migrations directory is not at any of: ${candidates.join(", ")}. Working directory was ${cwd}.`,
  );
}

/**
 * The adapter's options, for `cwd` rather than the process's own working directory.
 *
 * `cwd` is a parameter so the option this returns can be asserted under a layout that is not this
 * machine's. Every test that passed a temporary root exercised the resolver but not the call site, so
 * replacing the call back with an assumed `process.cwd()` path failed nothing: the deploy bug would have
 * returned with a green suite, which is the exact failure the suite exists to prevent.
 */
export function payloadDatabaseOptions(
  env: PayloadEnv = process.env,
  cwd: string = process.cwd(),
): SQLiteAdapterArgs {
  return {
    client: payloadDatabaseClient(env),
    // `push` lets Drizzle alter the database to match the config at startup, which is convenient and
    // unacceptable here: the demo's database is shared with a deployment, and a process that silently
    // added columns to it would be a schema change nobody approved. Payload writes the migration for
    // those tables instead, and applying it is a separate, deliberate step.
    push: false,
    // Resolved by candidate rather than assumed: this path has broken two deploys in this project already.
    migrationDir: payloadMigrationsDir(cwd),
    // Text ids, because the accounts collection reads the demo's own `users` table and those ids are
    // strings like `usr_owner`. SQLite is dynamically typed so it would store them either way, but
    // Payload's default is an autoincrementing integer, and an integer-typed id column over text ids makes
    // every relationship it writes point at a row that does not exist. Setting the adapter's id type is
    // what makes the two surfaces name the same account by the same value.
    idType: "uuid",
  };
}

export function payloadDatabase() {
  return sqliteAdapter(payloadDatabaseOptions());
}