// SPDX-License-Identifier: MIT

/**
 * The demo's sign-in: a password checked against a stored hash, and a session row behind the cookie.
 *
 * The cookie belongs to the package. `createSessionAuthAdapter` from the baseline signs a session id
 * so a client cannot invent one, and it is the only thing here that reads or writes an HTTP-only
 * cookie. The demo supplies the two decisions that adapter deliberately leaves to the host: which
 * account a set of credentials belongs to, and whether a session id still means anything.
 *
 * The role a session acts as is read from the user row its session row points at, so it is a stored
 * value rather than something a request can name. Nothing in the cookie carries a role, which is what
 * keeps a signed cookie from being a claim: it names a session, the session names a user, and the
 * user decides.
 *
 * The package's adapter rather than an auth library, because an auth library covers the same ground
 * and brings its schema with it: its own user, account and session tables, its own migrations
 * against a database that already has a schema and a `sessions` table, and its own column for the
 * role. This demo has scrypt hashes, seeded accounts and that table already, so this is the smaller
 * change, and it is the one that puts the baseline to work rather than installing a second answer
 * beside it.
 *
 * Sessions live in the demo's persistence adapter, which is Turso when the environment supplies it
 * and memory otherwise. A sign-in is therefore the same code whether or not a database is
 * configured, which is what keeps a fresh clone and a CI run working.
 */

import { createSessionAuthAdapter } from "../../src/baseline/session";
import type { AdminSessionCookieIO } from "../../src/baseline/session";
import type {
  AdminAuthAdapter,
  AdminLoginCredentials,
  AdminPersistenceAdapter,
  AdminSession,
} from "@yesvus/helmdeck";
import { authenticate } from "./demo-users";
import type { DemoUser } from "./demo-users";
import { demoUsers } from "./demo-accounts";
import { demoPersistence } from "./demo-persistence";
import { ensureDemoSeeded } from "./ensure-seeded";

/** Two weeks, which is also the cookie's own lifetime, so the row and the cookie expire together. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export const SESSION_COOKIE = "helmdeck_session";

/**
 * The signing secret, from the environment where there is one.
 *
 * A secret held in a repository is not a secret, so this is a constant and says so: the demo's
 * accounts are public and the password is printed on the login page, so what the signature is here
 * for is a client being unable to name a session id, and the row is what makes a sign-out revoke
 * something. A per-process random would be the worse answer, because a deployed demo answers the
 * next request from a different instance, every signature would fail, and every visitor would read
 * as signed out.
 */
function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.HELMDECK_SESSION_SECRET?.trim() || "helmdeck-demo-signs-its-own-cookies";
}

export type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  /** Seconds since the epoch, compared on read rather than left to a sweep. */
  expires_at: number;
};

export type SessionStore = {
  /** Writes the row and returns its id. The store names the row, so one path covers both stores. */
  start: (userId: string) => Promise<string>;
  read: (sessionId: string) => Promise<SessionRow | null>;
  end: (sessionId: string) => Promise<void>;
  /** Ends every session an account holds, and says how many there were. */
  endAll: (userId: string) => Promise<number>;
};

/** Sessions as rows in the demo's own store, so Turso and the in-memory adapter are one path. */
export function createSessionStore(adapter: AdminPersistenceAdapter): SessionStore {
  return {
    async start(userId) {
      const now = Date.now();
      const row = await adapter.create<SessionRow>("sessions", {
        user_id: userId,
        created_at: new Date(now).toISOString(),
        expires_at: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
      });
      return row.id;
    },

    read: (sessionId) => adapter.read<SessionRow>("sessions", sessionId),

    async end(sessionId) {
      await adapter.delete("sessions", sessionId);
    },

    async endAll(userId) {
      const rows = await adapter.query<SessionRow>("sessions", { user_id: userId });
      await Promise.all(rows.map((row) => adapter.delete("sessions", row.id)));
      return rows.length;
    },
  };
}

export type DemoAuthOptions = {
  /** Replaces the cookie store, for tests and for anything outside Next's request scope. */
  cookie?: AdminSessionCookieIO;
  /** Replaces the session store, for tests. Defaults to the demo's persistence adapter. */
  store?: SessionStore;
};

function defaultStore(): SessionStore {
  return createSessionStore(demoPersistence().adapter);
}

/**
 * The session a user id stands for: the account as stored, or null once there is no such row.
 *
 * The demo's accounts are rows like any other, so a role is a stored value and changing one is an
 * update to a record rather than a change to a build. The seed is awaited because the demo also
 * runs against a database nothing has written to yet, where a session would otherwise resolve no
 * account at all.
 *
 * A column that is not a role string becomes no role rather than an empty one, which is the answer
 * an account with nothing on it gets: the rule decides what no role may do, and that is nothing.
 */
async function sessionForUserId(userId: string): Promise<AdminSession | null> {
  await ensureDemoSeeded();
  const account = await demoPersistence().adapter.read<{ email?: unknown; role?: unknown }>(
    "users",
    userId,
  );
  if (!account) return null;
  return {
    email: typeof account.email === "string" ? account.email : "",
    role: typeof account.role === "string" ? account.role : undefined,
  };
}

/**
 * The session a row stands for, or null once the row itself is over.
 *
 * Expiry and a withdrawn account both end the row rather than merely refusing it, because a row
 * that no longer resolves is the kind of thing a database keeps for ever. The expiry is checked
 * here on every read so a session that lapsed an hour ago is invalid the moment it is looked at.
 */
async function accountFor(store: SessionStore, row: SessionRow | null): Promise<AdminSession | null> {
  if (!row) return null;
  // A value that is not a number expires, rather than reading as valid. `NaN <= now` is false, so
  // the comparison alone would treat an unparseable expiry as a session that never lapses, and the
  // one way to get here with a value like that is a row written by something other than this store.
  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
    await store.end(row.id);
    return null;
  }
  const session = await sessionForUserId(row.user_id);
  if (!session) {
    await store.end(row.id);
    return null;
  }
  return session;
}

/**
 * The session id a cookie names, split out of the sealed value.
 *
 * The signature covers exactly this part, so a caller that has already resolved the session from
 * the same cookie is holding an id the server issued rather than one a client wrote. The
 * separation is why nothing here takes an id from anywhere else.
 */
async function readCookieSessionId(cookie?: AdminSessionCookieIO): Promise<string | null> {
  const value = cookie
    ? await cookie.read()
    : await (async () => {
        const { cookies } = await import("next/headers");
        return (await cookies()).get(SESSION_COOKIE)?.value;
      })();
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  return separator > 0 ? value.slice(0, separator) : null;
}

/** The demo's `AdminAuthAdapter`, over the package's session adapter and the demo's session rows. */
export function demoAuth(options: DemoAuthOptions = {}): AdminAuthAdapter {
  const store = options.store ?? defaultStore();
  let started: string | null = null;

  const adapter = createSessionAuthAdapter({
    secret: sessionSecret(),
    cookie: options.cookie,
    cookieName: SESSION_COOKIE,
    maxAge: SESSION_TTL_SECONDS,
    // A Secure cookie is dropped over plain http, which is how the demo is reached in development.
    secure: process.env.NODE_ENV === "production",
    invalidMessage: "That email and password do not match an account.",
    async verify(credentials: AdminLoginCredentials) {
      const account = await authenticate(await demoUsers(), credentials.email, credentials.password);
      if (!account) return null;
      started = await store.start(account.id);
      return started;
    },
    async getUser(sessionId) {
      return accountFor(store, await store.read(sessionId));
    },
  });

  return {
    getSession: () => adapter.getSession(),

    async login(credentials) {
      started = null;
      try {
        return await adapter.login(credentials);
      } catch (cause) {
        // The row is written before the cookie, so a failure in between leaves a session nobody
        // holds the id to. It expires on its own, and ending it here keeps the store honest.
        if (started) await store.end(started);
        throw cause;
      }
    },

    async logout() {
      // The adapter is told only that there is no session now, not which one ended, so the id is
      // read back from the cookie. The session is resolved first, and the id is taken only from a
      // cookie the adapter accepted, so a forged or tampered one names no row and ends nothing.
      const session = await adapter.getSession();
      const sessionId = session ? await readCookieSessionId(options.cookie) : null;
      if (sessionId) await store.end(sessionId);
      await adapter.logout();
    },
  };
}

/** The signed-in account for the current request, or null. For a page that reads its own session. */
export function currentDemoSession(options: DemoAuthOptions = {}): Promise<AdminSession | null> {
  return demoAuth(options).getSession();
}

export function hasRole(session: AdminSession | null, role: DemoUser["role"]): boolean {
  return session?.role === role;
}

export type EndEverySessionResult =
  | { ok: true; ended: number; email: string }
  | { ok: false; message: string };

/**
 * Ends every session the calling account holds, and only if that account is an administrator.
 *
 * Two things were wrong here and both are the same mistake in different clothes. The check that this
 * is an administrator's call lived in the action, one layer above the thing it protects, so anything
 * that called this function directly skipped it entirely. And the target was resolved from a
 * `session` argument, so the identity the decision was made on and the identity the revocation acted
 * on were two separate values: a caller could be authorized as themselves and name somebody else.
 *
 * So the session is resolved here, from the signed cookie, and the account acted on is the account
 * that session belongs to. There is no second value to substitute. The result is a discriminated type
 * because "you may not do that" and "there was nothing to end" are different answers, and a caller
 * that cannot tell them apart reports a refusal as "ended 0 sessions".
 */
export async function endEverySession(options: DemoAuthOptions = {}): Promise<EndEverySessionResult> {
  const session = await currentDemoSession(options);
  if (!session) return { ok: false, message: "There is no session to end." };
  if (!hasRole(session, "admin")) {
    return { ok: false, message: "Only an administrator can end every session." };
  }

  const account = (await demoUsers()).find((user) => user.email === session.email);
  if (!account) return { ok: true, ended: 0, email: session.email };
  const ended = await (options.store ?? defaultStore()).endAll(account.id);
  // The account is named here, before the rows are gone. Ending every session includes the caller's
  // own, so a caller that re-resolved the session afterwards to describe the result would find
  // nothing and report it as a failure.
  return { ok: true, ended, email: session.email };
}
