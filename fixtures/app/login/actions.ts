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
import { demoAuth, endEverySession } from "../../lib/demo-session";
import { demoRecovery } from "../../lib/demo-auth-recovery";
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
 * Asks for a password-reset link, and says the same thing whichever address was asked about.
 *
 * The whole answer is the transport's, in `demoRecovery`, because that is where a sender is decided
 * and where the enumeration question is answered. A deployment with no sender returns the refusal,
 * which is what this one does until an operator points `HELMDECK_RECOVERY_WEBHOOK` at an endpoint:
 * the demo's accounts are seeded and its password is printed on the login page, so there is nothing
 * here for a visitor to have forgotten, and a link this process could not deliver is a credential
 * with no purpose but to be replayed.
 */
export async function requestPasswordRecoveryAction(
  email: string,
): Promise<{ ok: boolean; message: string }> {
  const outcome = await demoRecovery().request(email);
  return { ok: outcome.ok, message: outcome.message };
}

/**
 * Ends every session the signed-in administrator holds, including this one.
 *
 * Refused for any other role, read from the session rather than from what the browser sent, so an
 * editor gets the same answer whether or not they ever found the button.
 */
/**
 * A thin pass-through. The session is resolved and the role is checked inside `endEverySession`,
 * not here, because a check that lives in the caller is a check that any other caller can skip. A
 * direct call to this action with no cookie is refused there for the same reason.
 */
export async function endEverySessionAction(): Promise<{ ok: boolean; message: string; ended?: number }> {
  const result = await endEverySession();
  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    ended: result.ended,
    message: `Ended ${result.ended} ${result.ended === 1 ? "session" : "sessions"} for ${result.email}.`,
  };
}
