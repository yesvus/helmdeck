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
export function payloadDatabaseOptions(env: PayloadEnv = process.env): SQLiteAdapterArgs {
  return {
    client: payloadDatabaseClient(env),
    // `push` lets Drizzle alter the database to match the config at startup, which is convenient and
    // unacceptable here: the demo's database is shared with a deployment, and a process that silently
    // added columns to it would be a schema change nobody approved. Payload writes the migration for
    // those tables instead, and applying it is a separate, deliberate step.
    push: false,
    migrationDir: join(process.cwd(), "fixtures", "payload-migrations"),
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