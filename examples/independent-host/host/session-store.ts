import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | undefined;

function sessionDatabase(): DatabaseSync {
  if (database) return database;
  const filename = resolve(process.env.INDEPENDENT_HOST_SESSION_DB ?? ".next/independent-host-sessions.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  database = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("CREATE TABLE IF NOT EXISTS host_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL)");
  return database;
}

function removeExpiredSessions(db: DatabaseSync): void {
  db.prepare("DELETE FROM host_sessions WHERE expires_at <= ?").run(Date.now());
}

export function createPendingSession(id: string, expiresAt: number): void {
  const db = sessionDatabase();
  removeExpiredSessions(db);
  db.prepare("INSERT INTO host_sessions (id, expires_at, state) VALUES (?, ?, 'pending')").run(id, expiresAt);
}

export function getSessionExpiry(id: string): number | null {
  const db = sessionDatabase();
  removeExpiredSessions(db);
  const row = db.prepare("SELECT expires_at FROM host_sessions WHERE id = ?").get(id) as { expires_at: number } | undefined;
  return row?.expires_at ?? null;
}

export function activateSession(id: string): void {
  sessionDatabase().prepare("UPDATE host_sessions SET state = 'active' WHERE id = ? AND state = 'pending'").run(id);
}

export function revokeSession(id: string): void {
  sessionDatabase().prepare("DELETE FROM host_sessions WHERE id = ?").run(id);
}
