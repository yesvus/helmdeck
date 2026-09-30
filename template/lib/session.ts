import { redirect } from "next/navigation";
import { createCredentialAuthAdapter } from "@yesvus/helmdeck/baseline";
import { createAdminSessionGuard } from "@yesvus/helmdeck";
import type { AdminSession } from "@yesvus/helmdeck";
import { credentialStore } from "./persistence";
import { LOGIN_PATH, SESSION_COOKIE } from "./sign-in";

/**
 * The sign-in, on the package's credential store.
 *
 * A host supplies two things and this is all of them: somewhere to keep the rows, and the secret
 * that signs the cookie. The password check, the row behind the cookie, the expiry and the
 * revocation are the package's, because a sign-in written per host is a sign-in written wrong per
 * host.
 *
 * The role is read from the user row the session row points at, so it is a stored value. Nothing in
 * the cookie carries a role, which is what keeps a signed cookie from being a claim: it names a
 * session, the session names a user, and `lib/rules.ts` decides what that user may do.
 */
function sessionSecret(): string {
  const secret = process.env.HELMDECK_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "HELMDECK_SESSION_SECRET is not set. Mint one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"`, " +
        "put it in .env.local, and use the same value on every instance that has to agree on a " +
        "session. A secret held in the repository is not a secret, and a per-process random signs " +
        "every instance differently, so every visitor reads as signed out.",
    );
  }
  return secret;
}

export const auth = createCredentialAuthAdapter({
  secret: sessionSecret(),
  store: credentialStore,
  cookieName: SESSION_COOKIE,
  // A Secure cookie is dropped over plain http, which is how the template is reached in
  // development. In production the default stands and the cookie is Secure.
  secure: process.env.NODE_ENV === "production",
});

/** The signed-in account for this request, or null. */
export function currentAdminSession(): Promise<AdminSession | null> {
  return auth.getSession();
}

/**
 * No session, no page.
 *
 * This decides about a route rather than about a permission, and it runs where a redirect is a
 * response: a server component, a route handler or a server action. A page guarded only by a client
 * component has already been sent to whoever asked for it.
 *
 * A layout cannot read the path it is rendering, so the `returnTo` a caller passes is that
 * caller's segment root rather than the page the visitor wanted. The destination is preserved
 * properly by `proxy.ts`, which can read the request.
 */
export const requireAdminSession = createAdminSessionGuard({
  session: currentAdminSession,
  loginHref: LOGIN_PATH,
  onUnauthenticated: ({ loginHref }) => redirect(loginHref),
});
