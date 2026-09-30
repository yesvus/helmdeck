// SPDX-License-Identifier: MIT

/**
 * The demo's server-side decisions: the session a route needs, and the one place a permission is
 * decided.
 *
 * Both halves of the admin ask the rule in `demo-rules` and both do it through the package, so this
 * module hands out what the package built rather than deciding anything itself. The check is what
 * the views render against and the guard is what the server actions run, and they are two ends of
 * one decision rather than two decisions. The sign-in URLs are the package's for the same reason:
 * the destination in one is validated where the link is built, which is the only place where
 * validating it is worth anything.
 */

import { redirect } from "next/navigation";
import {
  adminLoginHref,
  createAdminPermissionCheck,
  createAdminPermissionGuard,
  createAdminSessionGuard,
  type AdminSession,
  type AdminSessionGuard,
} from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { LOGIN_PATH } from "./demo-sign-in";
import { currentDemoSession, type DemoAuthOptions } from "./demo-session";

export { LOGIN_PATH };

/**
 * Where a visitor lands after signing in when nothing recorded where they were going.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export type DemoGuardOptions = DemoAuthOptions & {
  /** The path the guard was protecting, so the login page can send the visitor back to it. */
  returnTo?: string;
};

/**
 * No session, no page.
 *
 * This is the half that decides about a route rather than about a permission, so it is the
 * package's session guard: it resolves the session the same way the actions do, and it builds the
 * sign-in URL the same way too, which means the destination is validated by the package's own rules
 * on the way into the link rather than by anything written here.
 *
 * It stays a redirect rather than a permission question because a page protected by nothing else has
 * to be refused before it is served, and a page guarded only by a client component has already been
 * served to whoever asked for it, so the check that refuses a request runs here, where the visitor's
 * browser never receives the page at all.
 *
 * The destination a caller passes is a fallback, not the answer to "where was this visitor going".
 * A layout cannot read the path it is rendering, so the redirect for a visitor with no cookie at all
 * is built in `fixtures/proxy.ts`, which can. What is left for this call is a visitor carrying a
 * cookie the guard refuses, and for those the caller knows the segment.
 */
export async function requireDemoSession({
  returnTo = DEFAULT_AFTER_LOGIN,
  ...auth
}: DemoGuardOptions = {}): Promise<AdminSession> {
  return sessionGuard(auth)({ returnTo });
}

/**
 * The guard for one request's session options.
 *
 * Built per call rather than once at the module, because the cookie and the store are the seam the
 * tests and anything outside Next's request scope read through, and a guard bound to one set of them
 * at import time would fix the browser it was built for.
 */
function sessionGuard(auth: DemoAuthOptions): AdminSessionGuard {
  return createAdminSessionGuard({
    session: () => currentDemoSession(auth),
    onUnauthenticated: ({ loginHref }) => redirect(loginHref),
    loginHref: LOGIN_PATH,
  });
}

/**
 * The answer the views render against, over the session the server resolved.
 *
 * The browser sends a permission name and nothing else: no session, no role, no verdict of its own
 * to hold, so there is no second place for a decision to be made.
 */
export const demoPermissionCheck = createAdminPermissionCheck({
  rule: demoCan,
  session: () => currentDemoSession(),
});

/** Where a visitor lands when an action refuses them for want of a session: the shell every action serves. */
const ACTIONS_RETURN_TO = "/shell";

/** The same URL, validated once, for a destination the demo itself chose rather than a request. */
const ACTIONS_LOGIN_HREF = adminLoginHref(LOGIN_PATH, ACTIONS_RETURN_TO);

/**
 * The same decision, for the server path, where it either returns the session or refuses.
 *
 * A refusal is answered here rather than in each caller: a missing session is a redirect, and a
 * session the rule refused is an error the caller did not get to choose, so the resource actions
 * run their effects only when this returns. The permission is named in the refusal because that is
 * the question the rule was asked, which is more diagnosable than a message naming the operation.
 */
export const requireDemoPermission = createAdminPermissionGuard({
  rule: demoCan,
  session: () => currentDemoSession(),
  onUnauthenticated: () => redirect(ACTIONS_LOGIN_HREF),
});
