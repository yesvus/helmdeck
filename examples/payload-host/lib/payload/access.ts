// SPDX-License-Identifier: MIT
/**
 * The rule, asked two ways.
 *
 * Payload's access functions are the rule. They are what the panel asks, what the Local API asks
 * when a call passes `overrideAccess: false`, and what the shell's permission adapter asks through
 * the package's bridge. There is one answer in `lib/rules.ts` and three callers of it, so the
 * sidebar and the panel cannot disagree about the same account.
 */

import type { Access } from "payload";
import type { AdminPayloadOperation, AdminPayloadUser } from "@yesvus/helmdeck";
import { can, principal } from "../rules";

/**
 * One access function per operation, all of them the host's rule.
 *
 * Payload asks its access functions with the request's user, which is whatever `overrideAccess:
 * false` was handed. The host's rule reads the role off it, and an account with no role is an
 * account this rule grants nothing to.
 */
export const payloadAccess =
  (operation: AdminPayloadOperation): Access =>
  ({ req: { user } }) =>
    can(principal(user), operation);

/**
 * The same rule, in the shape the package's permission adapter asks.
 *
 * The adapter names an operation rather than a collection, because the operation is the last part
 * of a permission name: `pages:read` asks about a read. The access functions are bound to this
 * host's content, so the operation is the whole of the question.
 */
export const accessByOperation: Partial<
  Record<AdminPayloadOperation, (args: { user: AdminPayloadUser | null }) => boolean>
> = {
  read: ({ user }) => can(principal(user), "read"),
  create: ({ user }) => can(principal(user), "create"),
  update: ({ user }) => can(principal(user), "update"),
  delete: ({ user }) => can(principal(user), "delete"),
};
