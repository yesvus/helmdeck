// SPDX-License-Identifier: MIT
"use server";

import { revalidatePath } from "next/cache";
import { adminReturnTo, type AdminLoginCredentials } from "@yesvus/helmdeck";
import { auth } from "@/lib/session";

/**
 * The sign-in and the sign-out, and the two decisions they make.
 *
 * Both run on the server. The credentials are checked there, by Payload, and the cookie is written
 * there, so a session that exists because a browser asked nicely is not a session.
 */

/** Where a visitor lands after signing in when nothing recorded where they were going. */
const DEFAULT_AFTER_LOGIN = "/admin";

export async function signInAction(
  credentials: AdminLoginCredentials,
  search: string | null,
): Promise<{ ok: true; next: string } | { ok: false; message: string }> {
  const result = await auth().login(credentials);
  if (!result.ok) return { ok: false, message: result.message };

  // Read back with the package's own `adminReturnTo`, which returns a value only if it is a plain
  // same-site path at every layer of encoding. A `next` that leaves the origin turns a sign-in page
  // into an open redirect, and this is the one place that value becomes a link somebody follows.
  return {
    ok: true,
    next: adminReturnTo(new URLSearchParams(search ?? "")) ?? DEFAULT_AFTER_LOGIN,
  };
}

/**
 * Ends the session the cookie names.
 *
 * The session is stateless, so there is no row behind it to end: what this clears is the browser's
 * copy of it, and the account's own state is unchanged. A host that needs a sign-out to be
 * revocable everywhere keeps session rows and ends them here.
 */
export async function signOutAction(): Promise<void> {
  await auth().logout();
  revalidatePath("/", "layout");
}
