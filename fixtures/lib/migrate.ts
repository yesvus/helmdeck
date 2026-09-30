// SPDX-License-Identifier: MIT

/**
 * Bringing a deployed database up to the schema the code expects.
 *
 * This existed as a claim rather than as code: the seed's own docstring said a deploy runs
 * migrations, and nothing ran them. Seven migration files sat in the repository that no deploy, no
 * script and no build hook ever reached, so a deploy of code that reads `landing_sections` met a
 * database that had never heard of it. It is written here because the alternative is a demo whose
 * schema silently tracks whatever was last applied by hand.
 *
 * Keyed by file name in a ledger table, not by a version number. The numbering carries the order and
 * nothing else, and two files currently share `0004_`: keying on the number would apply one and
 * silently skip the other, forever, which is the exact failure this is meant to remove.
 *
 * A migration is applied and only then recorded. Two instances booting at once can therefore apply
 * the same file twice, which every file here survives because they are all `CREATE ... IF NOT EXISTS`
 * or `INSERT OR IGNORE`. The alternative, recording first, risks the opposite and far worse case: a
 * file marked applied that never ran, on a database whose schema now claims something untrue.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlClient, SqlResult } from "./turso-persistence";

const MIGRATIONS_DIR = join(process.cwd(), "fixtures", "lib", "migrations");

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const LEDGER = `CREATE TABLE IF NOT EXISTS helmdeck_migrations (
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
  dir: string = MIGRATIONS_DIR,
): Promise<MigrationResult> {
  await client.execute({ sql: LEDGER });

  const done = new Set(await rows(client, "SELECT name FROM helmdeck_migrations"));
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
    await client.execute({ sql: "INSERT OR IGNORE INTO helmdeck_migrations (name) VALUES (?)", args: [file] });
    applied.push(file);
  }

  return { applied, skipped };
}
