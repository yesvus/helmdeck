// SPDX-License-Identifier: MIT
/**
 * The identity store that used to live only in the demo: a password checked against a stored
 * hash, and a session row behind the signed cookie.
 *
 * **What a host supplies, and why this shape.** Two things: somewhere to keep the rows, and the
 * secret that signs the cookie. The rows are reached through `CredentialStore`, six methods and
 * two plain records, because a host's schema is its own and the columns it picked are not the
 * demo's. `createPersistenceCredentialStore` fills that interface in over the
 * `AdminPersistenceAdapter` the package already ships, with the table and column names supplied as
 * options, so a host that is already on the memory or SQLite adapter adopts this with a config
 * object rather than an implementation, and a host with a real schema writes six methods.
 *
 * The alternative was to take a table name and build SQL here. That would work for exactly the
 * hosts already on `AdminPersistenceAdapter` and would put this package's idea of a schema in
 * front of everyone else, which is the decision a host has to make for itself.
 *
 * The role a session acts as is read from the user row the session points at, so it is a stored
 * value rather than something a request can name. Nothing in the cookie carries a role, which is
 * what keeps a signed cookie from being a claim: it names a session, the session names a user,
 * and the user decides. That is also what `mayEndAllSessions` is given to decide on, so a host's
 * own rule is applied to a value the client cannot write.
 *
 * **This module is server-side.** It reaches `node:crypto` for key derivation, which no browser
 * bundle can resolve, and the session cookie is HTTP-only and read through `next/headers`. The
 * intended wiring is a server action or route handler that owns the cookie, with a thin
 * client-side adapter that calls it.
 */

import type {
  AdminAuthAdapter,
  AdminLoginCredentials,
  AdminLoginResult,
  AdminPersistenceAdapter,
  AdminSession,
} from "../adapters/index.js";
import {
  createSessionAuthAdapter,
  createSessionSigner,
  DEFAULT_INVALID_MESSAGE,
  DEFAULT_SESSION_COOKIE,
  DEFAULT_SESSION_MAX_AGE,
  resolveSessionCookie,
} from "./session.js";
import type { AdminSessionCookieIO } from "./session.js";
import { hashPassword, normalizeEmail, verifyPassword } from "./passwords.js";

/** A user row, as far as signing in is concerned. Anything else on the row is the host's. */
export type CredentialUser = {
  id: string;
  /** Stored through `normalizeEmail`, which is how the lookup finds it again. */
  email: string;
  /** `scrypt$<salt>$<key>`, as `hashPassword` writes it. */
  passwordHash: string;
  role?: string;
  name?: string;
};

/** A session row. The cookie carries the id; this row is the authority on whether it still means anything. */
export type CredentialSession = {
  id: string;
  userId: string;
  /**
   * Seconds since the epoch, compared on every read rather than left to a sweep.
   *
   * A store backed by a text column may hand this back as a string, so the expiry is coerced
   * rather than trusted to have arrived as a number.
   */
  expiresAt: number;
};

/** Where the rows live. Four methods, because a host's schema is its own. */
export type CredentialStore = {
  findUserByEmail: (email: string) => Promise<CredentialUser | null>;
  findUserById: (id: string) => Promise<CredentialUser | null>;
  /** Writes the row and returns it. The store names the row, so one path covers any store. */
  createSession: (userId: string, expiresAt: number) => Promise<CredentialSession>;
  readSession: (id: string) => Promise<CredentialSession | null>;
  deleteSession: (id: string) => Promise<void>;
  /** Ends every session an account holds, and says how many there were. */
  deleteSessionsForUser: (userId: string) => Promise<number>;
};

/**
 * The tables a host needs, as SQL to run once.
 *
 * A session is a row rather than a self-contained cookie, which is what makes sign-out real:
 * clearing a cookie without deleting the row leaves a valid credential in someone's browser until
 * it expires. The expiry column rather than a TTL alone, so a session can be ended early and a
 * query for what is currently valid is one comparison rather than a scan.
 *
 * Constraints live in the database rather than only in this adapter, because an adapter can be
 * bypassed by a hand-edited request and a constraint the database does not enforce is a comment.
 * The role list is a starting point for a host with no users yet; a host that already has an
 * accounts table keeps it and points `createPersistenceCredentialStore` at its own columns.
 */
export const CREDENTIAL_USERS_SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
  -- scrypt$<salt>$<key>. The parameters travel with the hash, so they can be raised later
  -- without invalidating the rows already written.
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);`;

export const CREDENTIAL_SESSIONS_SCHEMA = `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Seconds since the epoch, compared on read, so a session that expired an hour ago is invalid
  -- the moment it is looked at rather than when someone notices.
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);`;

export type CredentialColumnOptions = {
  email?: string;
  passwordHash?: string;
  role?: string;
  name?: string;
};

export type CredentialStoreOptions = {
  /** The resource the user rows live in. */
  users?: string;
  /** The resource the session rows live in. */
  sessions?: string;
  userColumns?: CredentialColumnOptions;
  sessionColumns?: {
    userId?: string;
    createdAt?: string;
    expiresAt?: string;
  };
};

/**
 * Decides *who* the credentials belong to, or refuses without saying which half was wrong.
 *
 * An address with no account is answered by hashing a decoy and comparing against it, so the work
 * done is the work a real verification does. A store that answered "no such user" differently, or
 * faster, is a user enumeration oracle, and a public login form is exactly where that gets
 * harvested.
 */
export async function authenticate(
  store: CredentialStore,
  email: string,
  password: string,
): Promise<CredentialUser | null> {
  const user = await store.findUserByEmail(normalizeEmail(email));
  if (!user) {
    await verifyPassword(password, await decoyHash());
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

/**
 * One hash of a value nobody can log in with, computed once per process.
 *
 * The unknown-address path has to cost what the known-address path costs, and building the decoy
 * through the same `hashPassword` means the two paths differ only in which salt is used. It is
 * memoised because scrypt is deliberately slow and a sign-in that pays for it twice is the
 * enumeration oracle this exists to avoid.
 */
let decoy: Promise<string> | null = null;
function decoyHash(): Promise<string> {
  decoy ??= hashPassword("no such user");
  return decoy;
}

/**
 * The store a host that is already on `AdminPersistenceAdapter` adopts, with the table and column
 * names as options because those are the host's rather than the demo's.
 */
export function createPersistenceCredentialStore(
  persistence: AdminPersistenceAdapter,
  options: CredentialStoreOptions = {},
): CredentialStore {
  const users = options.users ?? "users";
  const sessions = options.sessions ?? "sessions";
  const userColumns = {
    email: "email",
    passwordHash: "password_hash",
    role: "role",
    name: "name",
    ...options.userColumns,
  };
  const sessionColumns = {
    userId: "user_id",
    createdAt: "created_at",
    expiresAt: "expires_at",
    ...options.sessionColumns,
  };

  function toUser(row: Record<string, unknown> | null): CredentialUser | null {
    if (!row) return null;
    const email = row[userColumns.email];
    const passwordHash = row[userColumns.passwordHash];
    // A row with no address or no hash in it cannot be signed in to, and saying so is the same
    // answer as there being no such account, so a half-written row cannot be probed for.
    if (typeof email !== "string" || typeof passwordHash !== "string") return null;
    // A column that is not a role string becomes no role rather than an empty one, which is the
    // answer an account with nothing on it gets: the rule decides what no role may do, and that
    // is nothing.
    const role = row[userColumns.role];
    const name = row[userColumns.name];
    return {
      id: String(row.id),
      email,
      passwordHash,
      ...(typeof role === "string" ? { role } : {}),
      ...(typeof name === "string" ? { name } : {}),
    };
  }

  return {
    async findUserByEmail(email) {
      const rows = await persistence.query<Record<string, unknown>>(users, {
        [userColumns.email]: email,
      });
      return toUser(rows[0] ?? null);
    },

    findUserById: async (id) => toUser(await persistence.read<Record<string, unknown>>(users, id)),

    async createSession(userId, expiresAt) {
      const now = Date.now();
      const row = await persistence.create<Record<string, unknown>>(sessions, {
        [sessionColumns.userId]: userId,
        [sessionColumns.createdAt]: new Date(now).toISOString(),
        [sessionColumns.expiresAt]: expiresAt,
      });
      return { id: String(row.id), userId, expiresAt };
    },

    readSession: async (id) => {
      const row = await persistence.read<Record<string, unknown>>(sessions, id);
      if (!row) return null;
      return {
        id: String(row.id),
        userId: String(row[sessionColumns.userId]),
        // Coerced because a host whose column is TEXT gets a number back as a string. A value
        // that is not a number at all arrives here as NaN, which the expiry check treats as
        // lapsed rather than as a session that never ends.
        expiresAt: Number(row[sessionColumns.expiresAt]),
      };
    },

    deleteSession: async (id) => {
      await persistence.delete(sessions, id);
    },

    async deleteSessionsForUser(userId) {
      const rows = await persistence.query<Record<string, unknown>>(sessions, {
        [sessionColumns.userId]: userId,
      });
      await Promise.all(rows.map((row) => persistence.delete(sessions, String(row.id))));
      return rows.length;
    },
  };
}

export type CredentialAuthOptions = {
  secret: string;
  store: CredentialStore;
  /** Seconds a session lasts. The cookie is given the same number, so the two lapse together. */
  maxAge?: number;
  cookie?: AdminSessionCookieIO;
  cookieName?: string;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  invalidMessage?: string;
  /**
   * Whether the account resolved from the request may end every session it holds.
   *
   * A host policy, because the package has no vocabulary for roles and a rule written here would
   * be a rule every host has to fight. The session is the one this adapter resolved from the
   * signed cookie, so its role is the stored value rather than something a request can name.
   *
   * Absent means refused. A capability that is off unless a host turns it on cannot be reached by
   * a host that has not thought about it, which is the only safe default for the one method here
   * that destroys something.
   */
  mayEndAllSessions?: (session: AdminSession) => boolean | Promise<boolean>;
  onError?: (cause: unknown) => void;
};

/**
 * The outcome of a revocation, which is either a count or a refusal.
 *
 * A count and a refusal are different answers, and a caller that cannot tell them apart reports
 * "ended 0 sessions" for a request it was never allowed to make, which reads as success.
 */
export type CredentialRevocation =
  | { ok: true; ended: number; email: string }
  | { ok: false; message: string };

export type CredentialAuthAdapter = AdminAuthAdapter & {
  /**
   * Ends every session the calling account holds, on every device, and says how many there were.
   *
   * There is no account argument, and that is the whole design. The caller is the account being
   * revoked: this adapter resolved them from the signed cookie, so the identity the rule decided
   * on and the identity the revocation acts on are one value rather than two that a caller could
   * point at different accounts. A signature that names some other session does not reach the
   * store at all, so there is no id here to substitute either.
   *
   * Whether that caller may is `mayEndAllSessions`, which is a host policy because the package
   * has no vocabulary for roles. It is refused unless the host supplies one.
   */
  endAllSessions: () => Promise<CredentialRevocation>;
};

/**
 * An `AdminAuthAdapter` over a user store and a session store.
 *
 * The cookie belongs to `createSessionAuthAdapter`, which is what signs it and what refuses a
 * forged one before any lookup happens. What this adds is the half that was the host's: the
 * password check, the row behind the cookie, and the expiry and revocation that make a sign-out
 * mean something beyond the browser that asked for one.
 */
export function createCredentialAuthAdapter(options: CredentialAuthOptions): CredentialAuthAdapter {
  const { store, secret } = options;
  if (!store) {
    throw new Error("createCredentialAuthAdapter needs a store to keep user and session rows in");
  }

  const maxAge = options.maxAge ?? DEFAULT_SESSION_MAX_AGE;
  const invalidMessage = options.invalidMessage ?? DEFAULT_INVALID_MESSAGE;
  const cookieName = options.cookieName ?? DEFAULT_SESSION_COOKIE;
  const path = options.path ?? "/";
  // The signature covers exactly the session id, so a caller that has already resolved the
  // session from the same cookie is holding an id the server issued rather than one a client
  // wrote. The separation is why nothing here takes an id from anywhere else.
  const signer = createSessionSigner(secret);

  async function cookies(): Promise<AdminSessionCookieIO> {
    return resolveSessionCookie(cookieName, options.cookie);
  }

  /**
   * The session a row stands for, or null once the row itself is over.
   *
   * Expiry is checked here on every read, so a session that lapsed an hour ago is invalid the
   * moment it is looked at. A row that no longer resolves is deleted rather than merely refused,
   * because a row that resolves to nothing is the kind of thing a database keeps for ever.
   */
  async function sessionFor(sessionId: string): Promise<AdminSession | null> {
    const row = await store.readSession(sessionId);
    if (!row) return null;

    // `Number.isFinite` before the comparison, because `NaN <= now` is false: an expiry that is
    // not a number would otherwise read as a session that never lapses, and the one way to get
    // one is a row written by something other than this store.
    const expiresAt = Number(row.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      await store.deleteSession(row.id);
      return null;
    }

    const user = await store.findUserById(row.userId);
    if (!user) {
      await store.deleteSession(row.id);
      return null;
    }
    return { email: user.email, ...(user.name ? { name: user.name } : {}), ...(user.role ? { role: user.role } : {}) };
  }

  /**
   * A fresh delegate per call, so the id a sign-in created is held by that sign-in alone.
   *
   * The rows are written before the cookie, so a failure in between leaves a session nobody holds
   * the id to. Ending it here keeps the store honest, and a delegate shared across calls could
   * end a concurrent sign-in's row instead of its own.
   */
  function delegate(onStarted?: (sessionId: string) => void): AdminAuthAdapter {
    return createSessionAuthAdapter({
      secret,
      cookie: options.cookie,
      cookieName,
      maxAge,
      path,
      sameSite: options.sameSite,
      secure: options.secure,
      invalidMessage,
      onError: options.onError,
      async verify(credentials: AdminLoginCredentials) {
        const user = await authenticate(store, credentials.email, credentials.password);
        if (!user) return null;
        const row = await store.createSession(user.id, Math.floor(Date.now() / 1000) + maxAge);
        onStarted?.(row.id);
        return row.id;
      },
      getUser: sessionFor,
    });
  }

  const reader = delegate();

  return {
    getSession: () => reader.getSession(),

    async login(credentials: AdminLoginCredentials): Promise<AdminLoginResult> {
      let started: string | null = null;
      try {
        return await delegate((sessionId) => {
          started = sessionId;
        }).login(credentials);
      } catch (cause) {
        if (started) await store.deleteSession(started);
        throw cause;
      }
    },

    async logout(): Promise<void> {
      // The delegate is told only that there is no session now, not which one ended, so the id is
      // read back from the cookie and unsealed with the same secret. A forged or tampered cookie
      // fails that check, so it names no row and ends nothing.
      const value = await (await cookies()).read();
      const sessionId = await signer.unseal(value);
      // The row first: clearing the cookie while the row lives would report a sign-out that only
      // ended this browser's copy of it.
      if (sessionId) await store.deleteSession(sessionId);
      await reader.logout();
    },

    async endAllSessions(): Promise<CredentialRevocation> {
      // The one value: whoever the signed cookie names, resolved by the same path every read
      // takes. Nothing the caller passes reaches this, so the account the rule decides on and
      // the account the rows belong to cannot be different accounts.
      const session = await reader.getSession();
      if (!session) {
        return { ok: false, message: "There is no session to end." };
      }

      // Before any row is read or written, so a refusal is observably a refusal: the store spy
      // stays untouched and a caller cannot learn anything from the difference.
      const permitted = await options.mayEndAllSessions?.(session);
      if (!permitted) {
        return { ok: false, message: "This account may not end every session." };
      }

      const user = await store.findUserByEmail(normalizeEmail(session.email));
      if (!user) {
        return { ok: false, message: "This account may not end every session." };
      }
      const ended = await store.deleteSessionsForUser(user.id);
      return { ok: true, ended, email: session.email };
    },
  };
}
