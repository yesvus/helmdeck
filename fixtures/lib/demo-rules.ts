// SPDX-License-Identifier: MIT
import type { AdminPermission } from "../../src/adapters/index";
import type { AdminSession } from "../../src/adapters/session";

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
 * Any signed-in account may do everything to an exposed resource today. That is a placeholder
 * rather than an oversight: the session carries a role and it decides nothing yet, and saying so is
 * better than shipping a role that only looks enforced. Adding a rule here is the whole of the
 * roles milestone, and it will apply to both halves at once because there is one function.
 */
export function demoCan(session: AdminSession | null, permission: AdminPermission): boolean {
  if (!session) return false;
  const resource = permission.split(".")[0] ?? "";
  return exposedResource(resource);
}
