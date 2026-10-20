import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | undefined;

export function closeSessionDatabase(): void {
  database?.close();
  database = undefined;
}

function sessionDatabase(): DatabaseSync {
  if (database) return database;
  const filename = resolve(process.env.INDEPENDENT_HOST_SESSION_DB ?? ".next/independent-host-sessions.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const candidate = new DatabaseSync(filename);
  try {
    chmodSync(filename, 0o600);
    candidate.exec("PRAGMA busy_timeout = 5000");
    candidate.exec("CREATE TABLE IF NOT EXISTS host_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    const columns = candidate.prepare("PRAGMA table_info(host_sessions)").all() as { name: string }[];
    if (columns.some(({ name }) => name === "state")) candidate.exec("ALTER TABLE host_sessions DROP COLUMN state");
  } catch (cause) {
    candidate.close();
    throw cause;
  }
  database = candidate;
  return candidate;
}

function removeExpiredSessions(db: DatabaseSync): void {
  db.prepare("DELETE FROM host_sessions WHERE expires_at <= ?").run(Date.now());
}

export function createSession(id: string, expiresAt: number): void {
  const db = sessionDatabase();
  removeExpiredSessions(db);
  db.prepare("INSERT INTO host_sessions (id, expires_at) VALUES (?, ?)").run(id, expiresAt);
}

export function getSessionExpiry(id: string): number | null {
  const db = sessionDatabase();
  removeExpiredSessions(db);
  const row = db.prepare("SELECT expires_at FROM host_sessions WHERE id = ?").get(id) as { expires_at: number } | undefined;
  return row?.expires_at ?? null;
}

export function revokeSession(id: string): void {
  sessionDatabase().prepare("DELETE FROM host_sessions WHERE id = ?").run(id);
}
