// SPDX-License-Identifier: MIT

/**
 * The demo's sign-in, sign-out and session actions.
 *
 * Every one of them runs on the server, and every one of them decides for itself: what the client
 * says about who it is, and about where it was going, is read here and checked here. A session
 * that exists because a browser asked nicely is not a session.
 */

"use server";

import { revalidatePath } from "next/cache";
import type { AdminLoginCredentials } from "@yesvus/helmdeck";
import { currentDemoSession, demoAuth, endEverySession, hasRole } from "../../lib/demo-session";
import { DEFAULT_AFTER_LOGIN, readReturnTo } from "../../lib/demo-guard";

/**
 * Checks the credentials and writes the session cookie.
 *
 * `search` is the login page's own query string, handed back rather than read again, so the
 * destination is validated against what the visitor actually arrived with. Anything that is not a
 * plain same-site path is dropped, because a `next` that leaves the origin turns a sign-in page
 * into an open redirect.
 */
export async function signInAction(
  credentials: AdminLoginCredentials,
  search: string | null,
): Promise<{ ok: true; next: string } | { ok: false; message: string }> {
  const result = await demoAuth().login(credentials);
  if (!result.ok) return { ok: false, message: result.message };

  return { ok: true, next: readReturnTo(new URLSearchParams(search ?? "")) ?? DEFAULT_AFTER_LOGIN };
}

export async function signOutAction(): Promise<{ ok: boolean; message: string; ended?: number }> {
  await demoAuth().logout();
  revalidatePath("/", "layout");
  return { ok: true, message: "Signed out, and the session on the server ended with it." };
}

/**
 * Ends every session the signed-in administrator holds, including this one.
 *
 * Refused for any other role, read from the session rather than from what the browser sent, so an
 * editor gets the same answer whether or not they ever found the button.
 */
export async function endEverySessionAction(): Promise<{ ok: boolean; message: string; ended?: number }> {
  const session = await currentDemoSession();
  if (!session) return { ok: false, message: "There is no session to end." };
  if (!hasRole(session, "admin")) {
    return { ok: false, message: "Only an administrator can end every session." };
  }

  const ended = await endEverySession(session);
  return {
    ok: true,
    ended,
    message: `Ended ${ended} ${ended === 1 ? "session" : "sessions"} for ${session.email}.`,
  };
}
