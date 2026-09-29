// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminPersistenceAdapter } from "../adapters/index.js";
import { parseAdminResourceQuery } from "../adapters/query.js";
import type { AdminResourcePage, AdminResourceQuery } from "../adapters/query.js";
import type { AdminPermissionGuard } from "../shell/permission-rule.js";
import type { AdminResourceRecord } from "./registry.js";

export type AdminResourceOperation = "read" | "create" | "update" | "delete";

/**
 * The five calls a client component makes, each one refusing on the server before its effect.
 *
 * Structurally an `AdminPersistenceAdapter`, so a host can hand these straight to
 * `AdminResourceList` and `AdminResourceForm` as the `persistence` those views read through, and
 * keep the enforcement in the module the client cannot reach.
 *
 * `queryPage` is here only when the host's adapter has it. Its absence is the whole of the
 * compatibility story, and it has to stay absence through this seam: a set of actions that always
 * offered a paged query would tell every generated list that a store which cannot count can count.
 */
export type AdminResourceActions = {
  /**
   * Passed through as the host's adapter takes it, which is how it has always behaved. A host that
   * wants its queries read, checked and counted asks for `queryPage`.
   */
  query: <T = AdminResourceRecord>(resource: string, query?: Record<string, unknown>) => Promise<T[]>;
  queryPage?: <T = AdminResourceRecord>(resource: string, query?: AdminResourceQuery) => Promise<AdminResourcePage<T>>;
  read: <T = AdminResourceRecord>(resource: string, id: string) => Promise<T | null>;
  create: <T = AdminResourceRecord>(resource: string, value: unknown) => Promise<T>;
  update: <T = AdminResourceRecord>(resource: string, id: string, value: unknown) => Promise<T>;
  delete: (resource: string, id: string) => Promise<void>;
};

/** Refused because the resource is not one this admin exposes, whatever the session may do. */
export class AdminResourceNotExposedError extends Error {
  readonly resource: string;

  constructor(resource: string) {
    super(`"${resource}" is not a resource this admin exposes`);
    this.name = "AdminResourceNotExposedError";
    this.resource = resource;
  }
}

/**
 * Resource calls that decide on the server, in front of the persistence adapter.
 *
 * `AdminResourceList` and `AdminResourceForm` read and write through a `persistence` prop from the
 * browser, so what a host puts behind that prop is the boundary. A resource name arrives there as a
 * string a caller chose, and anything reachable through it can be called directly with any argument
 * by a signed-in visitor or by anyone who can post to the action, which makes each call the place a
 * name becomes a capability.
 *
 * These wrap that boundary once. Every call refuses before touching the store, so a denial is a
 * refusal of the request rather than a button that was never drawn.
 *
 * ```ts
 * export const actions = createAdminResourceActions({
 *   guard: requirePermission,
 *   persistence,
 *   expose: exposedResource,
 *   permission: (resource, operation) => `${resource}.${operation}` as AdminPermission,
 * });
 * ```
 */
export function createAdminResourceActions({
  guard,
  persistence,
  expose,
  permission = (resource, operation) => `${resource}.${operation}` as AdminPermission,
  before,
}: {
  /** Decides. Required, because an action with nothing deciding it is a capability, not a feature. */
  guard: AdminPermissionGuard;
  persistence: AdminPersistenceAdapter;
  /** A closed set of resource names, for a host that exposes only some of what it stores. */
  expose?: (resource: string) => boolean;
  /** The permission an operation is checked against. Defaults to `resource.operation`. */
  permission?: (resource: string, operation: AdminResourceOperation) => AdminPermission;
  /**
   * Runs after the refusal and before the effect, for a host that has to prepare its store first.
   * Placing it here is what keeps a refused request from doing that work.
   */
  before?: (input: {
    resource: string;
    operation: AdminResourceOperation;
    resourceId?: string;
  }) => Promise<void> | void;
}): AdminResourceActions {
  if (typeof guard !== "function") {
    throw new Error(
      "createAdminResourceActions needs a guard. These calls are the boundary where a resource name " +
        "from the browser becomes a capability, so without one there is nothing that decides and the " +
        "actions are not created at all.",
    );
  }

  async function permit(resource: string, operation: AdminResourceOperation, resourceId?: string) {
    // Refused before the session is even resolved: a name outside the set is not a permission
    // question, and the answer would tell a caller which names are worth asking about.
    if (expose && !expose(resource)) throw new AdminResourceNotExposedError(resource);
    const name = permission(resource, operation);
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`No permission name is declared for ${operation} ${resource}`);
    }
    // The record goes in whenever the operation names one, because the view asks the same
    // question with it. The form's read and write checks carry this record's id, and the list's
    // row controls carry the row's, so a call that names a record and a call that does not are
    // two different questions and the rule answers each of them.
    const context = resourceId === undefined ? undefined : { resourceId };
    await guard(name, context);
    await before?.({ resource, operation, resourceId });
  }

  /**
   * The query as the store will see it, or a refusal.
   *
   * Read before the guard, because a query the shell cannot express is a malformed request rather
   * than a question about a session, and this answer says nothing about the resource or the caller
   * beyond what the caller already chose. Read before `before` too, so a store is not prepared for
   * a request that was never going to be a question at all.
   */
  function ask(value: unknown): AdminResourceQuery {
    return parseAdminResourceQuery(value);
  }

  return {
    // No record is named, so this asks the collection question the list view asks. Which rows a
    // host's query returns is their own scoping, alongside whatever else filters it, and asking
    // the rule once per returned row would put a second row filter in a place that cannot
    // compose with the first.
    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      await permit(resource, "read");
      return persistence.query<T>(resource, query);
    },

    // The record is named, so the decision is this record's, and it is made before the store is
    // reached: a record the rule withholds is not in the response, rather than refused after it
    // has been fetched.
    async read<T>(resource: string, id: string): Promise<T | null> {
      await permit(resource, "read", id);
      return persistence.read<T>(resource, id);
    },

    async create<T>(resource: string, value: unknown): Promise<T> {
      await permit(resource, "create");
      return persistence.create<T>(resource, value);
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      await permit(resource, "update", id);
      return persistence.update<T>(resource, id, value);
    },

    async delete(resource: string, id: string): Promise<void> {
      await permit(resource, "delete", id);
      await persistence.delete(resource, id);
    },

    // Only where the host's adapter has it, so a list mounted on these actions sees the same
    // capabilities it would see mounted on the adapter itself.
    ...(typeof persistence.queryPage === "function"
      ? {
        async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
          const asked = ask(query);
          await permit(resource, "read");
          return persistence.queryPage?.<T>(resource, asked) as Promise<AdminResourcePage<T>>;
        },
      }
      : {}),  };
}
