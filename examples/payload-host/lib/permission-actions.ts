// SPDX-License-Identifier: MIT
"use server";

import type { AdminPermission } from "@yesvus/helmdeck";
import { permissions } from "@/lib/permissions";

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
  if (context?.resourceId !== undefined) {
    // The adapter behind this answers from the role and the operation alone, so a question about a
    // record has no answer here. Refusing it is better than answering it as though it were about
    // the role, which would hand the record to everyone the role already allows.
    throw new Error(
      `The permission "${permission}" was asked about a record, and this host's rule does not read records.`,
    );
  }
  return permissions.can(permission);
}
