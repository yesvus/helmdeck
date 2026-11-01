// SPDX-License-Identifier: MIT
/**
 * Where Payload's tables live: the one database this host has.
 *
 * One URL, read here and nowhere else, so the shell's reads and Payload's writes cannot end up in
 * two places with two fates. The environment names it; a local file is the answer when the
 * environment says nothing, which is what makes a fresh clone run without configuring anything.
 */

import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Where Payload's own migrations live, for a deployment that does not push the schema. */
export const PAYLOAD_MIGRATIONS_DIR = join(here, "..", "..", "payload-migrations");

export function payloadDatabaseKind(url?: string): "sqlite" | "postgres" {
  const scheme = url?.trim().split(":", 1)[0]?.toLowerCase();
  return scheme === "postgres" || scheme === "postgresql" ? "postgres" : "sqlite";
}

/**
 * The database, and the one environment that points at it.
 *
 * `PAYLOAD_DATABASE_URL` selects SQLite/libSQL or PostgreSQL. The optional token belongs only to
 * libSQL; PostgreSQL credentials are carried by its URL.
 */
export function payloadDatabase() {
  const url = process.env.PAYLOAD_DATABASE_URL?.trim();
  const push = process.env.NODE_ENV === "development";

  if (payloadDatabaseKind(url) === "postgres") {
    return postgresAdapter({
      pool: { connectionString: url },
      push,
      migrationDir: PAYLOAD_MIGRATIONS_DIR,
      idType: "uuid",
    });
  }

  const authToken = process.env.PAYLOAD_DATABASE_TOKEN?.trim();
  return sqliteAdapter({
    client: {
      url: url || "file:./payload.db",
      ...(authToken ? { authToken } : {}),
    },
    // Development pushes the schema to match the config, so a change to a collection is one
    // restart away rather than a migration to write. Nothing else does: `push` alters whatever
    // database it is pointed at, and a shared database must not be changed by a process starting
    // up. A deployment runs Payload's own migrations instead.
    push,
    migrationDir: PAYLOAD_MIGRATIONS_DIR,
    // Text ids, so a document's id is the same in a local file and in a hosted database, and so an
    // id in a URL is not a row number.
    idType: "uuid",
  });
}
