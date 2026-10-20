import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("independent host session store", () => {
  let directory: string | undefined;
  const originalDatabasePath = process.env.INDEPENDENT_HOST_SESSION_DB;

  afterEach(() => {
    vi.resetModules();
    if (originalDatabasePath === undefined) delete process.env.INDEPENDENT_HOST_SESSION_DB;
    else process.env.INDEPENDENT_HOST_SESSION_DB = originalDatabasePath;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("migrates the legacy schema before caching the connection", async () => {
    directory = mkdtempSync(join(tmpdir(), "helmdeck-session-store-"));
    const filename = join(directory, "sessions.sqlite");
    const legacyDatabase = new DatabaseSync(filename);
    legacyDatabase.exec("CREATE TABLE host_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL)");
    legacyDatabase.close();
    process.env.INDEPENDENT_HOST_SESSION_DB = filename;

    const store = await import("../examples/independent-host/host/session-store");
    store.createSession("legacy-migrated", Date.now() + 60_000);

    expect(store.getSessionExpiry("legacy-migrated")).toBeGreaterThan(Date.now());
    const migratedDatabase = new DatabaseSync(filename);
    expect(migratedDatabase.prepare("PRAGMA table_info(host_sessions)").all().map((column) => column.name)).toEqual([
      "id",
      "expires_at",
    ]);
    migratedDatabase.close();
  });

  it("retries schema setup after a migration failure", async () => {
    directory = mkdtempSync(join(tmpdir(), "helmdeck-session-store-"));
    const filename = join(directory, "sessions.sqlite");
    const legacyDatabase = new DatabaseSync(filename);
    legacyDatabase.exec("CREATE TABLE host_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL)");
    legacyDatabase.exec("CREATE INDEX host_sessions_state ON host_sessions(state)");
    legacyDatabase.close();
    process.env.INDEPENDENT_HOST_SESSION_DB = filename;

    const store = await import("../examples/independent-host/host/session-store");
    expect(() => store.createSession("retry", Date.now() + 60_000)).toThrow();

    const repairDatabase = new DatabaseSync(filename);
    repairDatabase.exec("DROP INDEX host_sessions_state");
    repairDatabase.close();
    store.createSession("retry", Date.now() + 60_000);

    expect(store.getSessionExpiry("retry")).toBeGreaterThan(Date.now());
  });
});
