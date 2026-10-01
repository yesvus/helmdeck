// SPDX-License-Identifier: MIT

/**
 * How Payload's admin panel learns who is signed in: by reading the demo's own session cookie.
 *
 * This is the whole of "one login". A person signs in on the demo's form, the credential store
 * writes `helmdeck_session`, and every request Payload makes afterwards carries that cookie, so this
 * strategy resolves the same session the shell resolves. There is no second sign-in form, no second
 * password check and no bridge that copies an identity between two stores: there is one store, one
 * cookie, one session row, and Payload is a reader of it.
 *
 * The cost is worth stating plainly. Payload's admin panel issues its own `payload-token` once this
 * strategy succeeds, so a browser that has been here holds two cookies. That second cookie names a
 * Payload session rather than carrying a credential of its own, and dropping it costs a re-read of
 * helmdeck's row rather than a second sign-in. Turning Payload's token off entirely is not available
 * on this version, and the price of having no token is an admin panel that cannot serve its own
 * client-side routes.
 *
 * Resolution is delegated rather than reimplemented. The cookie is handed to the demo's own
 * `demoAuth` as a cookie reader, so the signature, the session row, the expiry and the revocation are
 * all decided by helmdeck's credential adapter over one code path. A check written here would be a
 * second answer about whether a session is valid, and the two would drift the first time a session
 * was ended early.
 */

import type { AuthStrategy, AuthStrategyResult } from "payload";
import { headers as nextHeaders } from "next/headers";
import type { AdminSessionCookieIO } from "@yesvus/helmdeck/baseline";
import { demoCredentialStore, currentDemoSession } from "./demo-session";
import { SESSION_COOKIE } from "./demo-sign-in";
import { demoPrincipal, payloadUserFor, type DemoPrincipal } from "./payload-accounts";

/** One cookie's value out of a `Cookie` header, or undefined when the header names no such cookie. */
export function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

/**
 * The demo's session reader, over whatever headers this request arrived with.
 *
 * `AdminSessionCookieIO` is the package's own seam for reaching the cookie from outside Next's
 * request scope, which is exactly the situation here: a strategy is handed `Headers`, not
 * `cookies()`. Only `read` is implemented, because a strategy answers a question and never signs
 * anyone in, so a write or a clear on this object would be a sign-out caused by an authentication.
 */
export function cookieReader(headers: Headers): AdminSessionCookieIO {
  return {
    read: () => cookieValue(headers.get("cookie"), SESSION_COOKIE),
    write: () => {
      throw new Error("Payload's auth strategy must not write a session; the demo's sign-in does");
    },
    clear: () => {
      throw new Error("Payload's auth strategy must not end a session; the demo's sign-out does");
    },
  };
}

/**
 * The demo account behind this request, or null.
 *
 * Two reads and both are needed. The session row says who is signed in and whether that session is
 * still live; the account row is what carries the role and the id Payload's relationships name. The
 * role is read from the account rather than from the session because the session is a statement
 * about a cookie and the account is the statement about a person.
 *
 * A session whose account has gone is refused rather than treated as anonymous-but-trusted, and the
 * account lookup is over the demo's own store, so a row that exists in one place exists in both.
 */
export async function resolveDemoPrincipal(
  headers?: Headers,
  readSession: typeof currentDemoSession = currentDemoSession,
  store = demoCredentialStore(),
): Promise<DemoPrincipal | null> {
  const source = headers ?? (await nextHeaders());
  const session = await readSession({ cookie: cookieReader(source) });
  if (!session) return null;

  const account = await store.findUserByEmail(session.email);
  if (!account) return null;

  return demoPrincipal(payloadUserFor({ id: account.id, email: account.email, role: account.role as never }));
}

/**
 * The custom strategy Payload runs on every request, after its own JWT strategy finds no token.
 *
 * Returning `{ user: null }` rather than throwing is what makes an anonymous request anonymous rather
 * than broken: Payload asks every strategy and takes the first answer, and a strategy that threw
 * would be logged as an error on every page a signed-out visitor reached.
 */
export const helmdeckSessionStrategy: AuthStrategy = {
  name: "helmdeck-session",
  authenticate: async ({ headers }): Promise<AuthStrategyResult> => {
    const principal = await resolveDemoPrincipal(headers);
    if (!principal) return { user: null };

    return {
      user: {
        ...payloadUserFor(principal),
        // Both are Payload's own additions to a user object rather than fields on this one: `collection`
        // is which auth collection the document belongs to, and `_strategy` is which of this
        // collection's strategies answered, which is what a host reads to tell its own strategy apart
        // from Payload's JWT one.
        collection: "demo-accounts",
        _strategy: "helmdeck-session",
      },
    };
  },
};

export const payloadAuthStrategies = [helmdeckSessionStrategy];