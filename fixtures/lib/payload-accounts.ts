// SPDX-License-Identifier: MIT

/**
 * Reading helmdeck's account as Payload's user, and Payload's user as helmdeck's session.
 *
 * The two live in one module because they are one translation. A person signs in once, on the demo's
 * own form, and the session that cookie names is the account Payload's access control is handed.
 * Anything that duplicated the mapping would be a second place where the two surfaces could answer
 * differently about who someone is.
 */

import type { DemoRole } from "./demo-users";

/**
 * What Payload hands its access functions as the request's user.
 *
 * The fields are `unknown` rather than typed because this is the shape arriving from outside: whatever
 * `overrideAccess: false` was handed, or whatever Payload read from a token. Typing them would be a
 * claim about the caller that the point of `demoPrincipal` is to check.
 */
export type PayloadPrincipal = {
  id?: unknown;
  collection?: unknown;
  email?: unknown;
  role?: unknown;
} & Record<string, unknown>;

/** The user object Payload's own types accept: an id, a collection, and an optional address. */
export type PayloadUser = {
  collection: string;
  email?: string;
  id: number | string;
  role?: DemoRole;
};

/**
 * What helmdeck's rule reads.
 *
 * The package's own `AdminSession`, with `role` narrowed to the two the rule defines. The email is
 * required because `AdminSession` requires it and the account row always has one, so there is no
 * case where a principal has a role and no address.
 */
export type DemoPrincipal = { id: string; email: string; role: DemoRole };

/** The two roles the demo's rule is written against. A role it does not define grants nothing. */
export function isDemoRole(value: unknown): value is DemoRole {
  return value === "admin" || value === "editor";
}

/**
 * Payload's user as a helmdeck session, or null when there is not one.
 *
 * Null rather than a permissive object, because every caller here is deciding whether to grant
 * something and a fallback that looks like a session is a fallback that grants it. The role is read
 * from the account row and narrowed to the two the rule defines, so a role column holding anything
 * else grants nothing at all rather than something unexamined.
 */
export function demoPrincipal(user: unknown): DemoPrincipal | null {
  if (!user || typeof user !== "object") return null;

  const { id, email, role } = user as PayloadPrincipal;
  if (typeof id !== "string" || id === "") return null;
  if (typeof email !== "string" || email === "") return null;
  if (!isDemoRole(role)) return null;

  return { id, email, role };
}

/**
 * helmdeck's session as the user object Payload's access functions receive.
 *
 * This is what `overrideAccess: false` takes as its `user`. The id is the demo's own account id, so
 * a document Payload writes records the same person the demo's audit trail does.
 */
export function payloadUserFor(session: DemoPrincipal): PayloadUser {
  return {
    id: session.id,
    email: session.email,
    role: session.role,
    collection: "demo-accounts",
  };
}