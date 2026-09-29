// SPDX-License-Identifier: MIT

/**
 * The two names the demo's sign-in is made of, in a module that imports nothing.
 *
 * `proxy.ts` has to name both of them and cannot import the modules that own them: `demo-session`
 * reaches the database and the seed, and `demo-guard` reaches `next/navigation`, so either import
 * would put a store and a redirect primitive inside a module whose whole job is to read a cookie
 * header and answer with a redirect. So the names live here, where anything can import them, and
 * the two modules that own them re-export from here rather than declaring their own.
 */

/** Where a visitor is sent to sign in, and the page that reads the `next` off its own URL. */
export const LOGIN_PATH = "/login";

/** The cookie the demo's session travels in. The proxy looks for this name and nothing else. */
export const SESSION_COOKIE = "helmdeck_session";
