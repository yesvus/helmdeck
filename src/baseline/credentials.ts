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
  /**
   * An account that has been turned off. It is not a delete: the row stays, so it can be turned
   * back on, and it holds no session, because both the sign-in and the read of a live session
   * refuse it.
   */
  disabled?: boolean;
};

/**
 * A user row as an operator-facing surface reports it.
 *
 * There is nowhere in this type to put a password hash, which is the point: a listing, a form or a
 * log line built from one cannot leak a credential because there was nothing to leak.
 */
export type AccountRecord = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  disabled: boolean;
  createdAt?: string;
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
  /** When the row was written, for a list that shows it. Absent from a store that does not hold it. */
  createdAt?: string;
};

/**
 * The write a caller asks for on an account.
 *
 * An absent key is left alone. `role: null` is the one value that clears rather than sets, because
 * "no role" and "leave the role as it is" are two different requests and a surface that could only
 * say one of them would make taking a role away impossible.
 */
export type AccountChanges = {
  role?: string | null;
  disabled?: boolean;
};

/** What a caller hands over to have an account written, with the password in the clear exactly once. */
export type NewAccount = {
  email: string;
  passwordHash: string;
  role?: string;
  name?: string;
};

/**
 * A store refusing to write a second account for an address that already has one.
 *
 * `createUser` is documented as having to refuse a duplicate address, and this is how a store says
 * it in a way `createAccountAdmin` can recognise. The alternative is a refusal recognisable only by
 * the text of the store's error, and a host that improves that text would lose its account create
 * rather than lose a message.
 *
 * The shipped adapters raise this rather than letting a duplicate through, because neither of them
 * has a unique index to refuse one: the memory adapter holds typed records and the SQLite one holds
 * JSON documents keyed by resource and id, so in both cases the address is a value inside a document
 * and nothing in the store knows it was supposed to be one of a kind.
 */
export class AccountAlreadyExistsError extends Error {
  readonly email: string;

  constructor(email: string) {
    super(`There is already an account for ${email}`);
    this.name = "AccountAlreadyExistsError";
    this.email = email;
  }
}

/**
 * Where the rows live. Six methods, because a host's schema is its own.
 *
 * The four the account surface needs are optional, and absent means the surface says the store
 * cannot do it rather than reporting an empty list or a success. A store written before this
 * interface grew them is a working sign-in, and it is a sign-in that refuses to become a
 * management surface without its owner adding the writes.
 */
export type CredentialStore = {
  findUserByEmail: (email: string) => Promise<CredentialUser | null>;
  findUserById: (id: string) => Promise<CredentialUser | null>;
  /** Writes the row and returns it. The store names the row, so one path covers any store. */
  createSession: (userId: string, expiresAt: number) => Promise<CredentialSession>;
  readSession: (id: string) => Promise<CredentialSession | null>;
  deleteSession: (id: string) => Promise<void>;
  /** Ends every session an account holds, and says how many there were. */
  deleteSessionsForUser: (userId: string) => Promise<number>;

  /** Every account, for the list a host renders. The hash is not among the fields it answers with. */
  listUsers?: () => Promise<AccountRecord[]>;
  /**
   * Writes one account, and **must refuse an address that already has one** by throwing
   * `AccountAlreadyExistsError`.
   *
   * Not optional in the sense that a store which does not do this still works, and a store which
   * writes a second row for one address is a host with two accounts for one person and a sign-in
   * that depends on which of them the lookup happened to find. A store with a unique index gets the
   * refusal from the database and rethrows it as this; a store without one has to check, which
   * covers one process and not several, and the cross-process half is a schema question the host
   * answers with an index rather than with anything in this interface.
   */
  createUser?: (account: NewAccount) => Promise<AccountRecord>;
  updateUser?: (id: string, changes: AccountChanges) => Promise<AccountRecord>;
  /** Live sessions, newest first, optionally narrowed to one account. A lapsed row is not one. */
  listSessions?: (userId?: string) => Promise<CredentialSession[]>;
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
 * The address is the one constraint on the users table, because a duplicate address is a fact
 * rather than a policy.
 *
 * **The role column is unconstrained, which is a change from the first version of this schema.**
 * That one carried `NOT NULL CHECK (role IN ('admin', 'editor'))`, which froze a two-role
 * vocabulary into the package for every host that ran it, including hosts whose own rule has
 * nothing to do with those two names. It is nullable now for the same reason it is unconstrained:
 * a role is whatever string the host's rule switches on, and a role the rule does not define grants
 * nothing, which is the answer an account with nothing on it already gets. A table created by the
 * earlier schema keeps its constraint, because SQLite cannot drop a CHECK from a column, so a host
 * wanting a role outside those two names recreates the table.
 */
export const CREDENTIAL_USERS_SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
  -- scrypt$<salt>$<key>. The parameters travel with the hash, so they can be raised later
  -- without invalidating the rows already written.
  password_hash TEXT NOT NULL,
  -- The host's own vocabulary, stored and never interpreted here. A null role is an account that
  -- can sign in and may do nothing, which is what a role the rule does not define also gets.
  role TEXT,
  -- Turned off rather than removed. A disable has to be reversible, and a row that outlives the
  -- person who held it is what the audit trail and every record they authored are attached to.
  disabled INTEGER NOT NULL DEFAULT 0,
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
  /**
   * The disable flag. Defaults to `disabled`, and a host whose table has no such column reads
   * `undefined`, which is an account that is not off rather than one that is.
   */
  disabled?: string;
  createdAt?: string;
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
  // A disabled account answers exactly as a wrong password does, and that is deliberate. A distinct
  // "this account is off" message is a second thing a public sign-in form can be asked, and it would
  // turn the form into an account-existence oracle for the one state an operator is most likely to
  // be asked about. The person signing in is told their credentials were not accepted, and whoever
  // turned the account off sees `disabled` on the row, which is where the diagnosis belongs.
  if (user.disabled) {
    // The same work either way, because "faster than a real attempt" is itself an answer.
    await verifyPassword(password, user.passwordHash);
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
    disabled: "disabled",
    createdAt: "created_at",
    ...options.userColumns,
  };
  const sessionColumns = {
    userId: "user_id",
    createdAt: "created_at",
    expiresAt: "expires_at",
    ...options.sessionColumns,
  };

  /**
   * Whether a row has been turned off.
   *
   * `disabled INTEGER NOT NULL DEFAULT 0` is how a database spells false, and a host with a boolean
   * column, a text column holding "true", or no column at all all have to land on the same answer.
   * Only the literal zero and the literal false read as off; everything else that is not a string
   * at all is treated as a number, so a column that arrived as `null` is off rather than unknown.
   */
  function isDisabled(row: Record<string, unknown>): boolean {
    const value = row[userColumns.disabled];
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value !== "" && value !== "0" && value.toLowerCase() !== "false";
    return Boolean(value);
  }

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
      // A null role and an empty string are both no role, because the rule grants an empty role
      // nothing and a listing should not show one as a role called "".
      ...(typeof role === "string" && role !== "" ? { role } : {}),
      ...(typeof name === "string" ? { name } : {}),
      ...(isDisabled(row) ? { disabled: true } : {}),
    };
  }

  /**
   * The same row as the account surface reports it, which is the row with the hash left off.
   *
   * A row the sign-in could not use at all is reported as no account rather than as an account with
   * no hash, because there is nothing to turn off or hand a role to.
   */
  function toAccount(row: Record<string, unknown> | null): AccountRecord | null {
    const user = toUser(row);
    if (!user) return null;
    const createdAt = row?.[userColumns.createdAt];
    return {
      id: user.id,
      email: user.email,
      ...(user.name !== undefined ? { name: user.name } : {}),
      ...(user.role !== undefined ? { role: user.role } : {}),
      disabled: user.disabled === true,
      ...(typeof createdAt === "string" ? { createdAt } : {}),
    };
  }

  /**
   * A row that came back without an address or a hash in it is not an account, and a store that
   * wrote one has a problem the caller needs to hear about rather than an `undefined` to render.
   */
  function unusableRow(resource: string, verb: string): never {
    throw new Error(
      `The ${resource} row ${verb} by this store cannot be read back as an account, because it has ` +
        "no address or no password hash in it. A management surface cannot report a row it cannot sign in to.",
    );
  }

  async function toSession(row: Record<string, unknown>): Promise<CredentialSession> {
    return {
      id: String(row.id),
      userId: String(row[sessionColumns.userId]),
      // Coerced because a host whose column is TEXT gets a number back as a string. A value
      // that is not a number at all arrives here as NaN, which the expiry check treats as
      // lapsed rather than as a session that never ends.
      expiresAt: Number(row[sessionColumns.expiresAt]),
      ...(typeof row[sessionColumns.createdAt] === "string"
        ? { createdAt: row[sessionColumns.createdAt] as string }
        : {}),
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
      return row ? toSession(row) : null;
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

    async listUsers() {
      const rows = await persistence.query<Record<string, unknown>>(users);
      // A half-written row is left out rather than reported, so a listing cannot show an account
      // whose hash arrived as something other than a hash.
      return rows.map(toAccount).filter((account): account is AccountRecord => account !== null);
    },

    async createUser(account) {
      // The store's own duplicate refusal, and the reason it is here rather than only in
      // `createAccountAdmin`: this method is exported, so a host calling it directly gets the same
      // guarantee the surface gives. It is a check and not a constraint, because these two adapters
      // store the address as a value inside a document and have no index that could refuse one, so
      // the check is the strongest thing available here and a host with a real unique address
      // column gets a stronger one from the database as well.
      const existing = await persistence.query<Record<string, unknown>>(users, {
        [userColumns.email]: account.email,
      });
      if (existing.length > 0) throw new AccountAlreadyExistsError(account.email);

      const row = await persistence.create<Record<string, unknown>>(users, {
        [userColumns.email]: account.email,
        [userColumns.passwordHash]: account.passwordHash,
        ...(account.role === undefined ? {} : { [userColumns.role]: account.role }),
        ...(account.name === undefined ? {} : { [userColumns.name]: account.name }),
      });
      return toAccount(row) ?? unusableRow(users, "written");
    },

    async updateUser(id, changes) {
      const existing = await persistence.read<Record<string, unknown>>(users, id);
      if (!existing) throw new Error(`No ${users} record with id ${id}`);
      const row = await persistence.update<Record<string, unknown>>(users, id, {
        ...existing,
        // A null role is written as a null rather than skipped, so clearing a role and not mentioning
        // it are the two different writes they are.
        ...(changes.role === undefined ? {} : { [userColumns.role]: changes.role }),
        // Only written when the caller is changing it, so a host whose users table has no disable
        // column can still change a role. `setDisabled` on such a table fails at the database,
        // which is the honest answer: the table cannot hold what was asked of it.
        ...(changes.disabled === undefined ? {} : { [userColumns.disabled]: changes.disabled ? 1 : 0 }),
      });
      return toAccount(row) ?? unusableRow(users, "updated");
    },

    async listSessions(userId) {
      const rows = await persistence.query<Record<string, unknown>>(
        sessions,
        userId === undefined ? undefined : { [sessionColumns.userId]: userId },
      );
      const now = Math.floor(Date.now() / 1000);
      const live = await Promise.all(rows.map(toSession));
      // A lapsed row is not a live session, so a list of them would offer a revoke button for
      // something that ended on its own. Newest first, which is the order a list of live sessions
      // is read in and the only order a store of one is useful in.
      return live
        .filter((session) => Number.isFinite(session.expiresAt) && session.expiresAt > now)
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
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
   * Put the session row's id on the session this adapter resolves.
   *
   * Off by default, because the id is a revocation handle rather than something a shell needs to
   * know who someone is, and a session the browser is handed should carry as little as it can. A
   * host rendering a sessions list turns it on, so the list can mark the caller's own row and
   * `createAccountAdmin`'s `endSession` can be called with a value the host is already holding.
   */
  includeSessionId?: boolean;
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

    // The account was turned off while the row was live, which is the race a disable does not wait
    // for: the disable ends the sessions it can see, and a sign-in already in flight writes its row
    // afterwards. Without this the disabled account is signed in again for the full fourteen days.
    // Checking on every read rather than only at the sign-in is what closes it, and the row goes
    // with the answer, so the next read has nothing left to find.
    if (user.disabled) {
      await store.deleteSession(row.id);
      return null;
    }

    return {
      ...(options.includeSessionId ? { id: row.id } : {}),
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      ...(user.role ? { role: user.role } : {}),
    };
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
