"use server";

import type { AdminPermission } from "@yesvus/helmdeck";
import { checkPermission } from "@/lib/rules";

/**
 * The whole of the bridge to the server.
 *
 * A `"use server"` file exports async functions, so the check the package built is called by one
 * rather than handed to the browser. The browser gets an answer about its own session and never
 * sends a verdict of its own, so there is no second place for a decision to be made.
 */
export async function checkPermissionAction(
  permission: AdminPermission,
  context?: { resourceId?: string },
): Promise<boolean> {
  return checkPermission(permission, context);
}
