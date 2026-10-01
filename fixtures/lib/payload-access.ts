// SPDX-License-Identifier: MIT

/**
 * The one place the demo's rule is asked about a Payload operation.
 *
 * Payload's access functions receive whatever `overrideAccess: false` was handed as `user`. That is
 * the seam this milestone is about, so the rule is asked rather than restated: `demoCan` is the same
 * function the shell's buttons and the resource actions are decided by, and a rule written
 * separately for Payload would be a second answer about the same editor.
 */

import type { Access } from "payload";
import { demoCan } from "./demo-rules";
import { demoPrincipal } from "./payload-accounts";

/** The resource every Payload collection maps onto. */
const PAYLOAD_RESOURCE = "posts";

/**
 * An operation Payload may perform, for a Payload user or null.
 *
 * `false` when there is no session. Payload treats an absent user as unauthenticated and asks the
 * rule anyway, so a function that answered permissively for one would grant every collection in the
 * config to anybody who reached the Local API without a session, which is exactly what
 * `overrideAccess` defaults to permitting.
 */
export function demoPayloadCan(user: unknown, operation: string): boolean {
  const session = demoPrincipal(user);
  if (!session) return false;
  return demoCan(session, `${PAYLOAD_RESOURCE}.${operation}`);
}

/**
 * One access function per operation, all of them this.
 *
 * Payload's type for a permission is the literal operation name, so the cast is confined to here
 * rather than repeated at each collection. What it costs is checked at run time by the demo's own
 * rule, which splits the string and refuses anything that is not `resource.operation`.
 */
export const payloadAccess =
  (operation: "create" | "read" | "update" | "delete" | "readVersions"): Access =>
  ({ req: { user } }) =>
    demoPayloadCan(user, operation);