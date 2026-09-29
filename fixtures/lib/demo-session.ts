// SPDX-License-Identifier: MIT

/**
 * The demo's sign-in, on the package's credential store.
 *
 * A host supplies two things to `createCredentialAuthAdapter` and this is the whole of them: somewhere
 * to keep the rows, and the secret that signs the cookie. The password check, the row behind the
 * cookie, the expiry that ends it and the revocation that ends all of them are the package's, because
 * a sign-in that is hand-written per host is a sign-in that is hand-wrong per host.
 *
 * The rows are the demo's own tables through the package's store over the demo's own persistence
 * adapter, so a sign-in is the same code whether or not a database is configured: Turso when the
 * environment supplies it and memory otherwise, which is what keeps a fresh clone and a CI run
 * working. The role a session acts as is read from the user row its session row points at, so it is a
 * stored value rather than something a request can name.
 *
 * The package's adapter rather than an auth library, because an auth library covers the same ground
 * and brings its schema with it: its own user, account and session tables, its own migrations
 * against a database that already has a schema and a `sessions` table, and its own column for the
 * role. This demo has scrypt hashes, seeded accounts and that table already, so this is the smaller
 * change, and it is the one that puts the baseline to work rather than installing a second answer
 * beside it.
 */

import {
  createCredentialAuthAdapter,
  createPersistenceCredentialStore,
} from "@yesvus/helmdeck/baseline";
import type { AdminSessionCookieIO, CredentialAuthAdapter, CredentialStore } from "@yesvus/helmdeck/baseline";
import type { AdminPersistenceAdapter, AdminSession } from "@yesvus/helmdeck";
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
function sessionSecret(): string {
  return process.env.HELMDECK_SESSION_SECRET?.trim() || "helmdeck-demo-signs-its-own-cookies";
}

export type DemoAuthOptions = {
  /** Replaces the cookie store, for tests and for anything outside Next's request scope. */
  cookie?: AdminSessionCookieIO;
  /** Replaces the row store, for a test that wants rows of its own. Defaults to the demo's tables. */
  store?: CredentialStore;
};

/**
 * The package's store over rows of the demo's own, with the workspace prepared first.
 *
 * The demo is a workspace rather than an empty database, and the accounts are rows of it now, so the
 * first sign-in against a database nothing has written to would find no account and answer as though
 * the password were wrong. Preparing the store before it is asked is what makes a fresh clone work,
 * and it is the demo's own arrangement rather than something a credential store should know about:
 * a host with accounts of its own has an address form and a store that already holds them.
 */
function prepared(store: CredentialStore): CredentialStore {
  const afterSeed = async <T>(call: () => Promise<T>): Promise<T> => {
    await ensureDemoSeeded();
    return call();
  };
  return {
    findUserByEmail: (email) => afterSeed(() => store.findUserByEmail(email)),
    findUserById: (id) => afterSeed(() => store.findUserById(id)),
    createSession: (userId, expiresAt) => afterSeed(() => store.createSession(userId, expiresAt)),
    readSession: (id) => afterSeed(() => store.readSession(id)),
    deleteSession: (id) => afterSeed(() => store.deleteSession(id)),
    deleteSessionsForUser: (userId) => afterSeed(() => store.deleteSessionsForUser(userId)),
  };
}

/**
 * Where the demo's user and session rows live: the package's store over the demo's own tables, whose
 * column names are the ones the seed and the migrations already write.
 */
export function demoCredentialStore(
  adapter: AdminPersistenceAdapter = demoPersistence().adapter,
): CredentialStore {
  return prepared(createPersistenceCredentialStore(adapter));
}

/**
 * The demo's `AdminAuthAdapter`, which is the package's, told where the rows are and who may revoke.
 *
 * The revocation policy is the one thing here the package deliberately leaves out, because it has no
 * vocabulary for roles: an administrator may end every session an account holds, and anything else
 * may not. The package refuses the capability when a host says nothing, so the demo has to say
 * something, and the session it says it about is the one the signed cookie resolved.
 */
export function demoAuth(options: DemoAuthOptions = {}): CredentialAuthAdapter {
  return createCredentialAuthAdapter({
    secret: sessionSecret(),
    store: options.store ?? demoCredentialStore(),
    cookie: options.cookie,
    cookieName: SESSION_COOKIE,
    maxAge: SESSION_TTL_SECONDS,
    // A Secure cookie is dropped over plain http, which is how the demo is reached in development.
    secure: process.env.NODE_ENV === "production",
    invalidMessage: "That email and password do not match an account.",
    mayEndAllSessions: (session) => session.role === "admin",
  });
}

/** The signed-in account for the current request, or null. For a page that reads its own session. */
export function currentDemoSession(options: DemoAuthOptions = {}): Promise<AdminSession | null> {
  return demoAuth(options).getSession();
}
