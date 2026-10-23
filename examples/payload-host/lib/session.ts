// SPDX-License-Identifier: MIT
/**
 * The one session, and the one place a person signs in.
 *
 * A person signs in on this host's own form, and the cookie that comes out of it is the session
 * everything else reads: the shell renders it, the permission adapter asks the rule with it, and
 * Payload's admin panel resolves it through the strategy in `lib/payload/auth-strategy.ts`. There is
 * no second sign-in form and no second account store, because Payload's `users` collection is the
 * account store and this module is the only thing that reads it.
 *
 * **The password is checked by Payload, not here.** The host asks Payload's own login operation
 * and takes the account it names. That is what keeps the host from holding a password hash of its
 * own: the hash lives in Payload's column, next to the rest of the account, and the host never
 * sees it.
 *
 * The session is stateless. The cookie carries the account's id, signed, so a browser cannot invent
 * one, and every request reads the account again to learn what it may do. The cost is stated in the
 * README rather than hidden: a sign-out ends the browser's copy of the session and cannot end a
 * copy somebody else kept.
 */

import { createSessionAuthAdapter } from "@yesvus/helmdeck/baseline";
import { createLoginThrottle } from "./engine/baseline/throttle";
import type { AdminAuthAdapter, AdminLoginCredentials, AdminPayloadUser, AdminSession } from "@yesvus/helmdeck";
import { AuthenticationError, getPayload } from "payload";
import { SESSION_COOKIE } from "./sign-in";

/** The collection the accounts live in. One name, so a typo cannot half-apply. */
export const USERS_COLLECTION = "users";

/**
 * The secret that signs the session cookie.
 *
 * Read from the environment where there is one, and refused where there is not: a secret held in a
 * repository is not a secret, and a per-process random signs every instance differently so every
 * visitor would read as signed out.
 */
function sessionSecret(): string {
  const secret = process.env.HELMDECK_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "HELMDECK_SESSION_SECRET is not set. Mint one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"`, " +
        "put it in .env.local, and use the same value on every instance that has to agree on a " +
        "session.",
    );
  }
  return secret;
}

/**
 * Payload's own instance, reached the way Payload reaches it.
 *
 * The import is dynamic because the config reaches this module: the config names the collections,
 * the collections name the auth strategy, and the strategy names this module. A static import back
 * into the config would be a cycle, and the config would be half-built when this module read it.
 */
async function payloadInstance() {
  const { default: config } = await import("../payload.config");
  return getPayload({ config });
}

let adapter: AdminAuthAdapter | null = null;

/**
 * The session adapter, built on first use.
 *
 * Built lazily rather than at import, because the secret is required and a build that never signs
 * anyone in should not fail on a missing environment variable.
 */
export function auth(): AdminAuthAdapter {
  adapter ??= createSessionAuthAdapter({
    secret: sessionSecret(),
    cookieName: SESSION_COOKIE,
    // A Secure cookie is dropped over plain http, which is how the host is reached in development.
    // In production the default stands and the cookie is Secure.
    secure: process.env.NODE_ENV === "production",
    // Bounded failed attempts on this form, so a guess costs a password check and not a password
    // check per guess.
    throttle: createLoginThrottle(),
    /**
     * The credentials, checked by Payload's own login operation.
     *
     * A wrong password is an authentication failure and nothing else, so it answers "no". Any other
     * failure is a fault rather than a refusal, and it is left to travel: a database that is down
     * must not read as a person who typed the wrong password.
     */
    async verify(credentials: AdminLoginCredentials): Promise<string | null> {
      const payload = await payloadInstance();
      try {
        const result = await payload.login({
          collection: USERS_COLLECTION,
          data: { email: credentials.email, password: credentials.password },
        });
        const id = result.user?.id;
        return id === undefined || id === null ? null : String(id);
      } catch (cause) {
        if (cause instanceof AuthenticationError) return null;
        throw cause;
      }
    },
    /**
     * The account behind a session id.
     *
     * The account is read as itself: the session names it, so the read passes that account as the
     * user, and the collection's access function answers "an account may read its own row". The
     * read is not privileged, because there is nothing here that a session without this account may
     * reach.
     */
    async getUser(sessionId: string): Promise<AdminSession | null> {
      const payload = await payloadInstance();
      const account = await payload.findByID({
        collection: USERS_COLLECTION,
        id: sessionId,
        depth: 0,
        disableErrors: true,
        overrideAccess: false,
        user: { id: sessionId, collection: USERS_COLLECTION },
      });
      if (!account) return null;

      const email = typeof account.email === "string" ? account.email : "";
      if (!email) return null;

      const role = typeof account.role === "string" ? account.role : undefined;
      return {
        userId: String(account.id),
        email,
        ...(role ? { role } : {}),
      };
    },
  });
  return adapter;
}

/** The signed-in account for this request, or null. */
export function currentAdminSession(): Promise<AdminSession | null> {
  return auth().getSession();
}

/**
 * The signed-in account as Payload's user.
 *
 * This is what the bridge hands Payload: the panel's access functions are asked about this user,
 * and the shell's permission adapter asks about the same one. The role travels with it, because the
 * rule reads the role and nothing else.
 */
export async function readPayloadSession(): Promise<AdminPayloadUser | null> {
  const session = await currentAdminSession();
  if (!session) return null;
  if (!session.userId) return null;

  const role = typeof session.role === "string" ? session.role : undefined;
  return {
    id: session.userId,
    email: session.email,
    collection: USERS_COLLECTION,
    ...(role ? { role } : {}),
  };
}
