// SPDX-License-Identifier: MIT
/**
 * The permission names, and the adapter that decides them.
 *
 * The names live here, once, and the operation is the last part of each: `pages:read` asks about a
 * read. The bridge derives the operation from the name, so a name that carries no operation is
 * refused rather than answered with a read.
 *
 * The adapter is the package's, backed by Payload's access functions. The host's rule stays the
 * rule and the shell does not get a second one.
 */

import { adminPayloadOperationFor, createAdminPayloadPermissionsAdapter } from "@yesvus/helmdeck";
import type { AdminPermissionsAdapter } from "@yesvus/helmdeck";
import { accessByOperation } from "./payload/access";
import { readPayloadSession } from "./session";

export const PERMISSIONS = {
  pagesRead: "pages:read",
  pagesCreate: "pages:create",
  pagesUpdate: "pages:update",
  pagesDelete: "pages:delete",
} as const;

/**
 * Every name above, checked against the package's own reader of a permission name.
 *
 * A name that carries no operation is refused by the bridge, which is the right answer at run time
 * and a puzzling one: the link simply never appears. Checked here, a typo is a failure while the
 * host is being written rather than a surface that is quietly missing.
 */
for (const permission of Object.values(PERMISSIONS)) {
  if (!adminPayloadOperationFor(permission)) {
    throw new Error(`The permission "${permission}" names no operation, so the bridge refuses it.`);
  }
}

/**
 * The adapter the shell mounts.
 *
 * It asks the same access functions Payload asks, over the same session, so a link that renders
 * and an operation that is refused cannot come to disagree about the same account.
 */
export const permissions: AdminPermissionsAdapter = createAdminPayloadPermissionsAdapter({
  access: accessByOperation,
  resolveUser: readPayloadSession,
});
