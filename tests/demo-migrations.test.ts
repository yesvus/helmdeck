// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { migrateDemo, splitStatements } from "../fixtures/lib/migrate";
import { createTursoPersistenceAdapter as makeAdapter, type SqlClient } from "../fixtures/lib/turso-persistence";
import { createCredentialAuthAdapter, createPersistenceCredentialStore } from "../src/baseline/credentials";
import { seedDemo } from "../fixtures/lib/seed";

const MIGRATIONS = join(process.cwd(), "fixtures", "lib", "migrations");
const FILES = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

function scratchDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `helmdeck-migrate-${name}-`));
  mkdirSync(join(dir, "sql"));
  return dir;
}

function clientFor(dir: string): { client: Client; sql: SqlClient } {
  const client = createClient({ url: `file:${join(dir, "db.sqlite")}` });
  return { client, sql: client as unknown as SqlClient };
}

function cookieJar() {
  let value: string | undefined;
  return {
    read: () => value,
    write: (next: string) => {
      value = next;
    },
    clear: () => {
      value = undefined;
    },
  };
}

describe("the migration runner", () => {
  it("brings a database at 0002 all the way up, and sign-in then works", async () => {
    const dir = scratchDir("up");
    const { client, sql } = clientFor(dir);

    // Production's actual state: the first two files, and nothing after them.
    for (const file of FILES.slice(0, 2)) {
      client.executeMultiple(readFileSync(join(MIGRATIONS, file), "utf8"));
    }
    const before = await sql.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    });
    expect(before.rows.map((row) => Object.values(row)[0])).toEqual([
      "dashboard_placements",
      "orders",
      "posts",
      "products",
      "sessions",
      "users",
    ]);

    const result = await migrateDemo(sql, MIGRATIONS);
    // Every file, not just the seven the schema is missing: the ledger is empty because it did not
    // exist before this runner did, and a file that has already run is replayed rather than assumed.
    // That is safe only because each one is `IF NOT EXISTS` or `INSERT OR IGNORE`, so this is the
    // assertion that would catch a migration file that is neither.
    expect(result.applied).toEqual(FILES);
    const replay = await migrateDemo(sql, MIGRATIONS);
    expect(replay.applied).toEqual([]);

    const adapter = makeAdapter(sql);
    await seedDemo(adapter, "helmdeck-demo");
    const auth = createCredentialAuthAdapter({
      secret: "a-secret-long-enough-for-this-test",
      store: createPersistenceCredentialStore(adapter),
      cookie: cookieJar(),
      cookieName: "hd",
      maxAge: 3600,
      secure: false,
      invalidMessage: "no match",
      mayEndAllSessions: () => true,
    });
    const login = await auth.login({ email: "owner@demo.helmdeck.dev", password: "helmdeck-demo" });
    expect(login.ok).toBe(true);
  }, 120000);

  it("applies nothing on a second run", async () => {
    const dir = scratchDir("twice");
    const { sql } = clientFor(dir);
    const first = await migrateDemo(sql, MIGRATIONS);
    const second = await migrateDemo(sql, MIGRATIONS);
    expect(first.applied).toEqual(FILES);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(FILES);
  }, 120000);

  it("never skips one file because another shares its number", async () => {
    const dir = scratchDir("dupes");
    const { sql } = clientFor(dir);
    const sharing = FILES.filter((f) => f.startsWith("0004_"));
    expect(sharing.length).toBeGreaterThan(1);
    const result = await migrateDemo(sql, MIGRATIONS);
    for (const file of sharing) expect(result.applied).toContain(file);
  }, 120000);

  it("records a file only after it ran", async () => {
    const dir = scratchDir("order");
    const sqlDir = join(dir, "sql");
    writeFileSync(join(sqlDir, "0001_bad.sql"), "CREATE TABLE good (id TEXT);\nSELECT this_is_not_sql();\n");
    await expect(migrateDemo(clientFor(dir).sql, sqlDir)).rejects.toThrow();
    const ledger = await clientFor(dir).sql.execute({ sql: "SELECT name FROM schema_migrations" });
    expect(ledger.rows).toEqual([]);
  }, 60000);

  it("applies a real file through a directory of copies, in name order", async () => {
    const dir = scratchDir("copies");
    const sqlDir = join(dir, "sql");
    for (const file of FILES) copyFileSync(join(MIGRATIONS, file), join(sqlDir, file));
    const { sql } = clientFor(dir);
    const result = await migrateDemo(sql, sqlDir);
    expect(result.applied).toEqual(FILES);
  }, 120000);
});

describe("the runner and the script it duplicates", () => {
  // Both write the ledger, and a database that has been migrated by hand is the normal case for a
  // deployed demo, so two ledger names means the boot runner re-applies every file the script already
  // applied and neither can say what has run. This reads the script rather than trusting a constant.
  it("records into the same ledger table the manual script uses", () => {
    const script = readFileSync(join(process.cwd(), "scripts", "apply-migrations"), "utf8");
    expect(script).toContain("schema_migrations");
    expect(script).not.toContain("helmdeck_migrations");
  });

  it("reads the same migrations directory the manual script reads", () => {
    const script = readFileSync(join(process.cwd(), "scripts", "apply-migrations"), "utf8");
    expect(script).toContain('MIGRATIONS_DIR="fixtures/lib/migrations"');
  });

  it("applies nothing the manual script has already recorded", async () => {
    const dir = scratchDir("shared-ledger");
    const { sql } = clientFor(dir);
    // Exactly what the script leaves behind: its own ledger, holding one applied file.
    await sql.execute({
      sql: "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
    });
    for (const file of FILES) {
      await sql.execute({ sql: "INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)", args: [file] });
    }

    const result = await migrateDemo(sql, MIGRATIONS);
    // A second ledger would have applied all nine again and reported every one of them.
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(FILES);
  });
});

describe("splitStatements", () => {
  it("does not split on a semicolon inside a quoted string", () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b');")).toEqual(["INSERT INTO t VALUES ('a;b')"]);
  });

  it("does not split on a semicolon inside a line comment", () => {
    expect(splitStatements("-- a; b\nSELECT 1;")).toEqual(["SELECT 1"]);
  });

  it("keeps a statement that spans lines", () => {
    expect(splitStatements("CREATE TABLE t (\n  a TEXT\n);")).toEqual(["CREATE TABLE t (\n  a TEXT\n)"]);
  });

  it("returns nothing for a file that is only comments", () => {
    expect(splitStatements("-- nothing here\n-- still nothing\n")).toEqual([]);
  });
});


describe("the deployed layout", () => {
  // The bug this pins: `process.cwd()` is the repository root in development and `/var/task/fixtures`
  // on Vercel, because the build sets `outputDirectory: fixtures/.next`. Joining `fixtures/lib/
  // migrations` onto that produced `/var/task/fixtures/fixtures/lib/migrations`, and the deploy
  // failed every request that reached the seed with a bare ENOENT.
  it("refuses with the paths it tried rather than a bare ENOENT", async () => {
    const original = process.cwd();
    const empty = mkdtempSync(join(tmpdir(), "helmdeck-nowhere-"));
    const escaped = empty.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      process.chdir(empty);
      // Async, so it rejects rather than throws, which is itself worth being explicit about: a
      // caller who wrote `expect(() => ...).toThrow()` would be asserting nothing.
      await expect(migrateDemo(clientFor(empty).sql)).rejects.toThrow(/the migrations directory is not at any of/);
      await expect(migrateDemo(clientFor(empty).sql)).rejects.toThrow(new RegExp(escaped));
    } finally {
      process.chdir(original);
    }
  });

  it("finds the migrations when the working directory is already the app root", async () => {
    // What Vercel actually is: cwd is the app, so the path is `lib/migrations` relative to it.
    const original = process.cwd();
    const staged = mkdtempSync(join(tmpdir(), "helmdeck-staged-"));
    // The deployed shape exactly: cwd is the app, so the files are at `lib/migrations` under it.
    mkdirSync(join(staged, "lib", "migrations"), { recursive: true });
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
      copyFileSync(join(MIGRATIONS, file), join(staged, "lib", "migrations", file));
    }
    try {
      process.chdir(staged);
      await expect(migrateDemo(clientFor(staged).sql)).resolves.toMatchObject({ applied: FILES });
    } finally {
      process.chdir(original);
    }
  }, 60_000);
});
