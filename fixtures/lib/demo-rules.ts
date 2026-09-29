// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";

/**
 * The resources this admin exposes, and the rule for whether a session may touch one.
 *
 * The set lives here because two callers need it and must not drift: the persistence actions check
 * a resource name that arrived from the browser before any name reaches a table, and the permission
 * rule checks the resource a permission is about. Duplicating the list in both would mean adding a
 * resource in one place and leaving the other answering about something it no longer agrees on.
 *
 * `users` and `sessions` are absent on purpose. They are reachable through the same persistence
 * interface as products, so a table browser that exposed them would put password hashes and session
 * rows behind a form.
 */
const EXPOSED = new Set(["products", "orders"]);

export function exposedResource(resource: string): boolean {
  return EXPOSED.has(resource);
}

type RoleRule = {
  /** Operations this role may perform on a resource it is allowed to reach. */
  operations: ReadonlySet<string>;
  /** Whether the role reaches every exposed resource, or only those not reserved to administrators. */
  everyResource: boolean;
};

/**
 * What a session is allowed to do, in one place.
 *
 * Both halves of the admin ask this question and must get the same answer. The resource views ask
 * through `AdminPermissionsAdapter`, which runs in the browser where the session is not available;
 * the persistence server actions ask directly, because they already hold the session and cannot be
 * talked around by a client that happens to render no buttons. Two decision points that could
 * disagree would mean a button that appears and then fails, or a hidden one whose action succeeds
 * anyway, so the rule lives here and both call it.
 *
 * The role is the whole of the answer, and it arrives on the session from the stored user row rather
 * than from anything the browser sent. That is what makes this a decision rather than a request: the
 * two seeded accounts are handed different powers here, and the server actions refuse exactly the
 * operations the views decline to render.
 *
 * A Map rather than an object literal, because the role is a string out of a stored row: an object
 * indexed with one answers for `constructor` and `toString`, which are roles nobody granted.
 */
const ROLE_RULES: ReadonlyMap<string, RoleRule> = new Map([
  ["admin", { operations: new Set(["read", "create", "update", "delete"]), everyResource: true }],
  ["editor", { operations: new Set(["read", "create", "update"]), everyResource: false }],
]);

/**
 * Resources reserved to administrators.
 *
 * Orders are listed as an administrator's page by the navigation already, and a rule that let the
 * action through while the link was hidden would make that filtering decoration.
 */
const ADMIN_ONLY = new Set(["orders"]);

/** Whether this session may perform this permission, which is named `resource.operation`. */
export function demoCan(session: AdminSession | null, permission: AdminPermission): boolean {
  if (!session) return false;
  const parts = permission.split(".");
  if (parts.length !== 2) return false;
  const [resource, operation] = parts;
  if (!exposedResource(resource)) return false;

  const rule = ROLE_RULES.get(session.role ?? "");
  // A session with no role, or with a role this rule does not define, may do nothing at all. The
  // permissive answer is what a role column nobody checked would otherwise hand out.
  if (!rule) return false;
  if (!rule.everyResource && ADMIN_ONLY.has(resource)) return false;
  return rule.operations.has(operation);
}
