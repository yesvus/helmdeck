// SPDX-License-Identifier: MIT

/**
 * The demo's server-side decisions: the session a route needs, and the one place a permission is
 * decided.
 *
 * Both halves of the admin ask the rule in `demo-rules` and both do it through the package, so this
 * module hands out what the package built rather than deciding anything itself. The check is what
 * the views render against and the guard is what the server actions run, and they are two ends of
 * one decision rather than two decisions.
 */

import { redirect } from "next/navigation";
import {
  createAdminPermissionCheck,
  createAdminPermissionGuard,
  type AdminSession,
} from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { currentDemoSession, type DemoAuthOptions } from "./demo-session";

export const LOGIN_PATH = "/login";

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
 * This is the half that decides about a route rather than about a permission, so it is not the
 * package's guard: a page protected by nothing else has to be refused before it is served, which is
 * a redirect rather than a permission question. A page guarded only by a client component has
 * already been served to whoever asked for it, so the check that refuses a request runs here, where
 * the visitor's browser never receives the page at all.
 */
export async function requireDemoSession({
  returnTo = DEFAULT_AFTER_LOGIN,
  ...auth
}: DemoGuardOptions = {}): Promise<AdminSession> {
  const session = await currentDemoSession(auth);
  if (session) return session;
  redirect(`${LOGIN_PATH}?next=${encodeURIComponent(returnTo)}`);
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
  onUnauthenticated: () => redirect(`${LOGIN_PATH}?next=${encodeURIComponent("/shell")}`),
});

/**
 * Control characters, refused because a URL parser strips them before resolving, so
 * "/%0D%0A/evil.example" passes every other check below and still resolves to another origin.
 */
// eslint-disable-next-line no-control-regex -- the point is to reject these, not to match them
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function isSameSitePath(value: string): boolean {
  if (CONTROL_CHARACTERS.test(value)) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return !value.includes("\\");
}

/**
 * The destination a guard recorded, read back where the redirect is actually made.
 *
 * The package exports `adminReturnTo` for this, from a module marked `"use client"` because the
 * hook beside it reads the browser's search params. That makes the function unreachable from a
 * server component or a server action, which is the only place a destination may be read: a value
 * the client checked is a value the client chose. The rules are the package's own, so what this
 * accepts and what `adminReturnTo` accepts are the same set, and three layers of encoding are
 * peeled before the path is believed, so an obfuscated one is refused rather than guessed at.
 */
export function readReturnTo(search: URLSearchParams | null | undefined): string | null {
  const raw = search?.get("next");
  if (!raw || !isSameSitePath(raw)) return null;

  let current = raw;
  for (let round = 0; round < 3; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      // A malformed escape is not a path anyone meant to visit.
      return null;
    }
    if (decoded === current) return current;
    if (!isSameSitePath(decoded)) return null;
    current = decoded;
  }
  // Still changing after three rounds, so the value is obfuscated past the point of being read
  // safely. Refuse rather than choose a layer.
  return null;
}
