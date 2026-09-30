// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";

/**
 * The resources this admin exposes, and the one rule that says what a session may do with one.
 *
 * The set lives here because two callers need it and must not drift: `createAdminResourceActions`
 * checks a resource name that arrived from the browser before any name reaches a table, and the rule
 * checks the resource a permission is about. Duplicating the list in both would mean adding a
 * resource in one place and leaving the other answering about something it no longer agrees on.
 *
 * `users` and `sessions` are absent on purpose. They are reachable through the same persistence
 * interface as products, so a table browser that exposed them would put password hashes and session
 * rows behind a form.
 *
 * `landing_sections` is the landing page the collection editor arranges. It is here rather than
 * special-cased in that editor, because a second rule answering "may this session do this" is how the
 * views and the actions come to disagree about the same question, and the disagreement shows up as a
 * button that appears and then fails.
 *
 * `dashboard_placements` is the engine dashboard's arrangement, declared as such by
 * `0001_initial.sql`. It was deliberately absent at first, and for a real reason: it is a table of
 * ordered things a person arranges, which is also what the landing page is, so the collection editor
 * reached for it and two surfaces would have been writing one table. The landing page was given its
 * own `landing_sections` table instead, and with the two separated both can be exposed without either
 * one reaching the other's rows.
 *
 * `posts` is the CMS's own content, on the same reasoning: the collection editor, the revisions
 * history and the dashboard's tiles all ask the one rule rather than each keeping its own list.
 *
 * `site_settings` is the demo's own site configuration, read and written by the settings page
 * through the same actions. It is here rather than reached by a private path so the settings screen
 * answers the same question as a product form and cannot drift from it.
 *
 * `customers` and `shipments` are here because a resource that points at another one needs both of
 * its names in the same closed set: a reference is resolved by reading the row it names, so a
 * shipment's `customer_id` is a `customers` row and an editor is refused the read without `customers`
 * being exposed at all. The point of the pair is that `shipments.order_id` names an `orders` row,
 * which an editor may not read, and a column whose target is refused offers no choices and refuses
 * the writes naming one.
 */
const EXPOSED = new Set([
  "products",
  "orders",
  "landing_sections",
  "site_settings",
  "posts",
  "dashboard_placements",
  "customers",
  "shipments",
]);

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
 * What a session is allowed to do, in one place, and the only decision the demo makes about it.
 *
 * The package asks this function on both sides of the admin and the two answers cannot disagree:
 * `createAdminPermissionCheck` is what the browser half asks, `createAdminPermissionGuard` is what the
 * server path runs, and both evaluate this rule over the session the server resolved. A rule that
 * answered a request as well as a decision would be two answers to one question, which is how a
 * button comes to render and then fail.
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

/**
 * The rule, in the shape the package asks one: a session it resolved and a permission named
 * `resource.operation`.
 *
 * Declared as the synchronous answer it is, which `AdminPermissionRule` allows, because the demo's
 * other callers need a boolean to render a control with. A host whose rule has to ask a store can
 * return a promise here instead, and the package awaits it.
 *
 * There is no session check here because the package does it before asking. A rule that had to
 * defend itself against a session that is not there would be a second decision about the same
 * question, and the one that governs it is the one that refuses.
 *
 * Nothing reads the record, so this rule answers the same for `read`, `update` and `delete` of a
 * record whatever the record is. That is the demo's policy rather than a limit of the seam: the
 * package hands the record's id in the context, and a host whose rule withholds one record decides it
 * here and is enforced on both sides of the admin with no change to anything but this function.
 */
export const demoCan = (session: AdminSession, permission: AdminPermission): boolean => {
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
};
