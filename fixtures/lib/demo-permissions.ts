// SPDX-License-Identifier: MIT
import type { AdminPermissionsAdapter } from "@yesvus/helmdeck";
import { checkPermissionAction } from "./permission-actions";

/**
 * The adapter the shell mounts. `check` reaches the server because permission is decided where the
 * session is, which the browser does not have. The rule itself is in `demo-rules`, shared with the
 * persistence actions so the two cannot drift: what renders and what is served are the same answer
 * to the same question, and both of them are answered about the role on the account's stored row.
 */
export function demoPermissionsAdapter(): AdminPermissionsAdapter {
  return {
    can: (permission) => checkPermissionAction(permission),
  };
}
