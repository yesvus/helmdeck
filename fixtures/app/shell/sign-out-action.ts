// SPDX-License-Identifier: MIT
"use server";

import { demoAuth } from "../../lib/demo-session";

/**
 * Signing out of the shell ends the session, rather than clearing a cookie and leaving a working
 * credential in the browser until it expires on its own.
 */
export async function signOutAction() {
  await demoAuth().logout();
}
