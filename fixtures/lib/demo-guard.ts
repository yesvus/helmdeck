// SPDX-License-Identifier: MIT

/**
 * Route protection for the demo: no session, no page.
 *
 * This is the half that decides. A page guarded only by a client component has already been served
 * to whoever asked for it, so the check that refuses a request runs here, where a redirect is a
 * response rather than a rendering decision, and where the visitor's browser never receives the
 * page at all.
 */

import { redirect } from "next/navigation";
import type { AdminSession } from "../../src/adapters/index";
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

export async function requireDemoSession({
  returnTo = DEFAULT_AFTER_LOGIN,
  ...auth
}: DemoGuardOptions = {}): Promise<AdminSession> {
  const session = await currentDemoSession(auth);
  if (session) return session;
  redirect(`${LOGIN_PATH}?next=${encodeURIComponent(returnTo)}`);
}

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
  if (!raw) return null;

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
