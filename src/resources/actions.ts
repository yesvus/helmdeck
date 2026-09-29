// SPDX-License-Identifier: MIT
import type { AdminPermission, AdminPersistenceAdapter } from "../adapters/index.js";
import type { AdminPermissionGuard } from "../shell/permission-rule.js";
import type { AdminResourceRecord } from "./registry.js";

export type AdminResourceOperation = "read" | "create" | "update" | "delete";

/**
 * The five calls a client component makes, each one refusing on the server before its effect.
 *
 * Structurally an `AdminPersistenceAdapter`, so a host can hand these straight to
 * `AdminResourceList` and `AdminResourceForm` as the `persistence` those views read through, and
 * keep the enforcement in the module the client cannot reach.
 */
export type AdminResourceActions = {
  query: <T = AdminResourceRecord>(resource: string, query?: Record<string, unknown>) => Promise<T[]>;
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
    // A record-scoped decision for the calls the views decide per record, and a collection-scoped
    // one for the calls the views decide for the whole collection. The id is here because the view
    // passes that row's id to the same check, so leaving it out would ask a different question on
    // the two halves.
    const context = resourceId === undefined ? undefined : { resourceId };
    await guard(name, context);
    await before?.({ resource, operation, resourceId });
  }

  return {
    async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
      await permit(resource, "read");
      return persistence.query<T>(resource, query);
    },

    async read<T>(resource: string, id: string): Promise<T | null> {
      await permit(resource, "read");
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
  };
}
