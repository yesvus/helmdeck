// SPDX-License-Identifier: MIT
"use server";

import type { AdminPermission } from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { currentDemoSession } from "./demo-session";

/**
 * Answers a permission check from the server, because the session it depends on lives there.
 *
 * The browser renders nothing it has not been told it may render, so this decides the same thing
 * the persistence actions decide. The session it answers about is resolved here, from the cookie's
 * signed session id and the user row behind it, so a client can ask any permission it likes and gets
 * an answer about its own session, never an answer it supplied.
 */
export async function checkPermissionAction(permission: AdminPermission): Promise<boolean> {
  const session = await currentDemoSession();
  return demoCan(session, permission);
}
