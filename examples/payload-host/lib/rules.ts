// SPDX-License-Identifier: MIT
/**
 * The one rule, and the one place a permission is decided.
 *
 * Payload's access functions are the rule, and Helmdeck's permission adapter asks them, so the two
 * halves of this admin cannot answer differently about the same session: the sidebar, the list and
 * the panel are all reading the same answer from the same function.
 *
 * The role is the whole of the answer, and it is read from the account row rather than from
 * anything a request sent, so it is a decision and not a request.
 */

import type { AdminPayloadOperation } from "@yesvus/helmdeck";

/**
 * The account behind a request, as the rule reads it.
 *
 * The fields are `unknown` rather than typed because this is the shape arriving from outside:
 * whatever Payload's access function was handed as the user. Typing them would be a claim about the
 * caller that the point of `principal` is to check.
 */
export type HostPrincipal = {
  id: string;
  email?: string;
  role?: unknown;
};

/**
 * The account behind a request, or null when there is not one.
 *
 * Null rather than a permissive object, because every caller here is deciding whether to grant
 * something and a fallback that looks like an account is a fallback that grants it. The role is
 * narrowed to the two the rule defines, so a role column holding anything else grants nothing at all
 * rather than something unexamined.
 */
export function principal(user: unknown): HostPrincipal | null {
  if (!user || typeof user !== "object") return null;

  const { id, email, role } = user as { id?: unknown; email?: unknown; role?: unknown };
  if (typeof id !== "string" && typeof id !== "number") return null;
  if (id === "") return null;

  return {
    id: String(id),
    ...(typeof email === "string" && email !== "" ? { email } : {}),
    role,
  };
}

/**
 * What each role may do, by operation.
 *
 * A Map rather than an object literal, because the role is a string out of a stored row: an object
 * indexed with one answers for `constructor` and `toString`, which are roles nobody granted.
 */
const ROLE_OPERATIONS: ReadonlyMap<string, ReadonlySet<AdminPayloadOperation>> = new Map([
  ["admin", new Set<AdminPayloadOperation>(["read", "create", "update", "delete"])],
  ["editor", new Set<AdminPayloadOperation>(["read", "create", "update"])],
]);

/**
 * The rule: may this account do this to the content.
 *
 * There is no session check here because the caller makes one before asking. A rule that had to
 * defend itself against a missing session would be a second decision about the same question, and
 * the one that governs it is the one that refuses.
 */
export function can(user: HostPrincipal | null, operation: AdminPayloadOperation): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role : "";
  return ROLE_OPERATIONS.get(role)?.has(operation) ?? false;
}

/**
 * Whether this account is an administrator.
 *
 * The accounts themselves are not content, so they are not in the operation map above: what an
 * account may do to another account is a different question, and it has one answer.
 */
export function isAdmin(user: HostPrincipal | null): boolean {
  return user?.role === "admin";
}
