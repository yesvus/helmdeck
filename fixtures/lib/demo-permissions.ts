// SPDX-License-Identifier: MIT
import type { AdminPermissionsAdapter } from "@yesvus/helmdeck";
import { checkPermissionAction } from "./permission-actions";

/**
 * The adapter the shell mounts. `check` reaches the server because permission is decided where the
 * session is, which the browser does not have. The rule itself is in `demo-rules` and the check that
 * evaluates it is built by the package, the same construction the persistence actions run, so what
 * renders and what is served cannot drift: there is one rule and one decision about it, and both
 * of them are answered about the role on the account's stored row.
 */
export function demoPermissionsAdapter(): AdminPermissionsAdapter {
  return {
    can: (permission, context) => checkPermissionAction(permission, context),
  };
}
