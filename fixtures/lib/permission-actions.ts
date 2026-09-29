// SPDX-License-Identifier: MIT
"use server";

import type { AdminPermission, AdminPermissionContext } from "@yesvus/helmdeck";
import { demoPermissionCheck } from "./demo-guard";

/**
 * Answers a permission check from the server, because the session it depends on lives there.
 *
 * The browser renders nothing it has not been told it may render, so this decides the same thing
 * the persistence actions decide. The session it answers about is resolved here, from the cookie's
 * signed session id and the user row behind it, so a client can ask any permission it likes and gets
 * an answer about its own session, never an answer it supplied.
 *
 * The record is carried across with the question when the view named one, because that is the record
 * the same view is deciding about. Dropping it here would make the views and the actions ask
 * different questions, which a rule that withholds one record answers differently.
 *
 * This is the whole of the bridge: a `"use server"` file exports async functions, so the package's
 * check is called by one rather than handed out.
 */
export async function checkPermissionAction(
  permission: AdminPermission,
  context?: AdminPermissionContext,
): Promise<boolean> {
  return demoPermissionCheck(permission, context);
}
