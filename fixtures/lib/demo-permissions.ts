// SPDX-License-Identifier: MIT
import type { AdminPermissionsAdapter } from "../../src/adapters/index";
import { checkPermissionAction } from "./permission-actions";

/**
 * The adapter the shell mounts. `check` reaches the server because permission is decided where the
 * session is, which the browser does not have. The rule itself is in `demo-rules`, shared with the
 * persistence actions so the two cannot drift.
 */
export function demoPermissionsAdapter(): AdminPermissionsAdapter {
  return {
    can: (permission) => checkPermissionAction(permission),
  };
}
