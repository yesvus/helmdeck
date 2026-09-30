import { redirect } from "next/navigation";
import { adminLoginHref, createAdminPermissionCheck, createAdminPermissionGuard } from "@yesvus/helmdeck";
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";
import { adminResources } from "./resources";
import { currentAdminSession } from "./session";
import { LOGIN_PATH } from "./sign-in";

/**
 * Every authorization decision this admin makes, in one file and one function.
 *
 * Nothing else in the template reads a role, compares one, or builds a set of permitted operations.
 * The sidebar, the generated list, the generated form and the server actions that reach the store
 * all ask the two values below, which are the package's own two ends of one rule, so what renders
 * and what is served cannot answer differently about the same session.
 *
 * **Replace this file's contents. Do not add a second rule beside it.** A check written beside the
 * one the views ask is a second answer to the same question, and the two disagreeing is what a
 * button that renders and then fails looks like from the outside.
 */

/**
 * The resources that exist, taken from the definitions rather than repeated here.
 *
 * One list, so a resource added to `lib/resources.ts` cannot be reachable through the store and
 * invisible to the rule. The accounts and the sessions are in the store and not in this set, which
 * is what keeps their rows out of a table browser that exists for everything else.
 */
const EXPOSED = new Set(adminResources.map((definition) => definition.resource));

export function exposedResource(resource: string): boolean {
  return EXPOSED.has(resource);
}

/**
 * What each role may do, by operation.
 *
 * A Map rather than an object literal, because the role is a string out of a stored row: an object
 * indexed with one answers for `constructor` and `toString`, which are roles nobody granted.
 *
 * Add a role here and create an account holding it. Remove one and nothing changes for the
 * accounts that still have another.
 */
const ROLE_OPERATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["admin", new Set(["read", "create", "update", "delete"])],
  ["editor", new Set(["read", "create", "update"])],
]);

/**
 * The rule, in the shape the package asks one: a session the server resolved, a permission named
 * `resource.operation`, and the record it is about.
 *
 * There is no session check here because the package makes one before asking. A rule that had to
 * defend itself against a missing session would be a second decision about the same question, and
 * the one that governs it is the one that refuses.
 *
 * Nothing here reads the record, so this answers the same for every product whatever the product
 * is. That is a starting policy rather than a limit of the seam: the record's id arrives in the
 * context, and a rule that withholds one record decides it here and is enforced on both sides with
 * no change to anything but this function.
 */
export function can(session: AdminSession, permission: AdminPermission): boolean {
  const [resource, operation] = permission.split(".");
  if (operation === undefined || !exposedResource(resource)) return false;
  // A session with no role, or with a role this map does not define, may do nothing at all. The
  // permissive answer is what a role column nobody checked would otherwise hand out.
  return ROLE_OPERATIONS.get(session.role ?? "")?.has(operation) ?? false;
}

/**
 * The answer the views render against, over the session this request resolved.
 *
 * The browser sends a permission name and nothing else: no session, no role, no verdict of its own
 * to hold, so there is no second place for a decision to be made.
 */
export const checkPermission = createAdminPermissionCheck({
  rule: can,
  session: currentAdminSession,
});

/**
 * The same decision, for the server path, where it either returns the session or refuses.
 *
 * A missing session is a redirect and a refused session is a thrown `AdminPermissionDeniedError`,
 * both decided here rather than in each caller, so the store's actions run their effects only when
 * this returns.
 */
export const requirePermission = createAdminPermissionGuard({
  rule: can,
  session: currentAdminSession,
  onUnauthenticated: () => redirect(adminLoginHref(LOGIN_PATH, "/admin")),
});
