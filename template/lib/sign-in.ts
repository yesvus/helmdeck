/**
 * The two names the sign-in is made of, in a module that imports nothing.
 *
 * `proxy.ts` has to name both of them and cannot import the modules that own them: `lib/session.ts`
 * reaches the database and `lib/rules.ts` reaches a redirect, and a redirect that opened a
 * connection to answer "is there a cookie" would be a redirect that fails when the database does. So
 * the names live here, where anything can import them, and the two modules that own them read them
 * from here rather than declaring their own.
 */

/** Where a visitor is sent to sign in, and the route that reads the `next` off its own URL. */
export const LOGIN_PATH = "/login";

/** The cookie the session travels in. The proxy looks for this name and nothing else. */
export const SESSION_COOKIE = "helmdeck_session";
