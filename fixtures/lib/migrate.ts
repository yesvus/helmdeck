// SPDX-License-Identifier: MIT

/**
 * Bringing a deployed database up to the schema the code expects, at boot.
 *
 * `scripts/apply-migrations` already existed and already did this correctly, keyed by file name in a
 * `schema_migrations` ledger. **The defect was never that it was missing: it is referenced by no
 * deploy, no build hook and no package script**, and it requires a named target and the `turso` CLI,
 * so it can only be run by a person who knows to. Seven migration files sat applied-by-hand while a
 * deploy of code reading `landing_sections` met a database that had never heard of it.
 *
 * This is the same ledger and the same file-name key, run from the application instead of from a
 * terminal, because a step only a person remembers is a step that does not happen. It shares
 * `schema_migrations` with the script rather than keeping a second ledger: two ledgers over one
 * directory of files is two sources of truth about what has run, and the disagreement between them
 * would be invisible until a file was applied twice or skipped once.
 *
 * A file is applied and only then recorded. Two instances booting at once can therefore apply the
 * same file twice, which every file here survives because they are all `CREATE ... IF NOT EXISTS` or
 * `INSERT OR IGNORE`. The alternative, recording first, risks the opposite and far worse case: a
 * file marked applied that never ran, on a database whose schema now claims something untrue.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlClient, SqlResult } from "./turso-persistence";

/**
 * Where the migration files are, resolved rather than assumed.
 *
 * `process.cwd()` is the repository root in development and **`/var/task/fixtures` on Vercel**,
 * because the build sets `outputDirectory: fixtures/.next`. Joining `fixtures/lib/migrations` onto
 * that yields `/var/task/fixtures/fixtures/lib/migrations`, which does not exist, and the deploy
 * failed every request that touched the seed with a bare `ENOENT` on a path nobody had ever seen.
 *
 * So the candidates are tried and the first one that is a directory wins, and when none is, the error
 * names every path that was tried. A missing file that says where it looked is a five-second fix; one
 * that names a path the reader has no reason to believe in is the outage this runner was written to
 * prevent.
 */
function migrationsDir(): string {
  const candidates = [
    join(process.cwd(), "fixtures", "lib", "migrations"),
    join(process.cwd(), "lib", "migrations"),
    join(process.cwd(), "migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `the migrations directory is not at any of: ${candidates.join(", ")}. ` +
      "Working directory was " +
      process.cwd() +
      ".",
  );
}

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * Splits a migration file into statements.
 *
 * `--` comments and quoted strings are both respected, because a semicolon inside either is not a
 * statement boundary. `executeMultiple` would do this correctly, but it is a method on the libsql
 * client rather than on the two-method `SqlClient` the demo's adapter takes, so a host passing a
 * plain record here gets the split version and has to get it right.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]!;
    const pair = sql.slice(i, i + 2);

    if (!quote && pair === "--") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function rows(client: SqlClient, sql: string): Promise<string[]> {
  const result: SqlResult = await client.execute({ sql });
  return (result.rows ?? []).map((row) => String(row[0]));
}

/**
 * Applies every migration file the ledger has not recorded, in file-name order.
 *
 * Returns rather than throws on an empty ledger, and throws on a file that fails, because a migration
 * that half applied is a schema nobody can reason about and the next request deserves to fail loudly
 * rather than serve whatever is there.
 */
export async function migrateDemo(
  client: SqlClient,
  dir: string = migrationsDir(),
): Promise<MigrationResult> {
  await client.execute({ sql: LEDGER });

  const done = new Set(await rows(client, "SELECT name FROM schema_migrations"));
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(dir, file), "utf8");
    for (const statement of splitStatements(sql)) {
      await client.execute({ sql: statement });
    }
    await client.execute({ sql: "INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)", args: [file] });
    applied.push(file);
  }

  return { applied, skipped };
}
