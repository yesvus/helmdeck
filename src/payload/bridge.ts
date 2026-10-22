// SPDX-License-Identifier: MIT

/**
 * The bridge between Helmdeck's shell and Payload's admin.
 *
 * The package does not depend on Payload: a host that uses Payload as its CMS passes its own
 * instance and the bridge is written against the shape it needs. The three pieces are the ones
 * that have to be right for the two to share a session, a rule and a database.
 */

/** The user Payload sees, which is the host's own principal in Payload's shape. */
export type AdminPayloadUser = {
  id: string;
  email?: string;
  collection?: string;
  [key: string]: unknown;
};

/** The refusals the bridge throws, so a caller can tell one from a failed call. */
export class AdminPayloadAccessRefused extends Error {
  constructor(operation: string) {
    super(`Payload ${operation} refused: no session resolved to a principal`);
    this.name = "AdminPayloadAccessRefused";
  }
}

/**
 * The shape of the Payload instance the bridge calls. It is structural on purpose: the package
 * takes the host's Payload without depending on Payload itself.
 */
export type AdminPayloadInstance = {
  find(args: { collection: string; [key: string]: unknown }): Promise<unknown>;
  findByID(args: { collection: string; id: string | number; [key: string]: unknown }): Promise<unknown>;
  create(args: { collection: string; data: unknown; [key: string]: unknown }): Promise<unknown>;
  update(args: { collection: string; id: string | number; data: unknown; [key: string]: unknown }): Promise<unknown>;
  delete(args: { collection: string; id: string | number; [key: string]: unknown }): Promise<unknown>;
};

/** How the host reads the session of the current request. */
export type AdminPayloadSessionReader = () => Promise<AdminPayloadUser | null>;

export type AdminPayloadContent = {
  find: (collection: string, args?: Record<string, unknown>) => Promise<unknown>;
  findByID: (collection: string, id: string | number, args?: Record<string, unknown>) => Promise<unknown>;
  create: (collection: string, data: unknown, args?: Record<string, unknown>) => Promise<unknown>;
  update: (collection: string, id: string | number, data: unknown, args?: Record<string, unknown>) => Promise<unknown>;
  delete: (collection: string, id: string | number, args?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * The only path from Helmdeck's server code into Payload's data.
 *
 * Every call passes `overrideAccess: false` and a user. Those two are the whole of what makes a
 * Local API call permission-checked: Payload's `overrideAccess` **defaults to `true`**, so a call
 * that forgets it reads and writes with no access control at all and behaves exactly as though it
 * were correct. There is no error, no warning and no log line for the omission. Passing a user
 * alone does nothing either, because with access control switched off there is nothing to check it
 * against.
 *
 * So both are passed here, together, in one module, rather than at each call site. A call site that
 * remembered one of them is a call site that silently has no permission check, and the only defence
 * against that is there being nowhere else to make the call from.
 *
 * A request with no session is refused before it reaches Payload, because a session that cannot be
 * read as a principal is not an anonymous principal, it is a request that must not be answered.
 */
export function createAdminPayloadContent({
  payload,
  resolveUser,
}: {
  payload: AdminPayloadInstance;
  resolveUser: AdminPayloadSessionReader;
}): AdminPayloadContent {
  const call = async <T,>(operation: string, run: (user: AdminPayloadUser) => Promise<T>): Promise<T> => {
    const user = await resolveUser();
    if (!user) throw new AdminPayloadAccessRefused(operation);
    return run(user);
  };

  return {
    find: (collection, args = {}) =>
      call("find", (user) => payload.find({ collection, ...args, overrideAccess: false, user })),
    findByID: (collection, id, args = {}) =>
      call("findByID", (user) => payload.findByID({ collection, id, ...args, overrideAccess: false, user })),
    create: (collection, data, args = {}) =>
      call("create", (user) => payload.create({ collection, data, ...args, overrideAccess: false, user })),
    update: (collection, id, data, args = {}) =>
      call("update", (user) => payload.update({ collection, id, data, ...args, overrideAccess: false, user })),
    delete: (collection, id, args = {}) =>
      call("delete", (user) => payload.delete({ collection, id, ...args, overrideAccess: false, user })),
  };
}

/**
 * The strategy Payload's admin authenticates with, so that one sign-in serves both: Payload reads
 * the host's session and the shell keeps the session it already had.
 */
export function createAdminPayloadAuthStrategy({
  readSession,
}: {
  readSession: AdminPayloadSessionReader;
}) {
  return {
    authenticate: async (...args: unknown[]) => {
      void args;
      const user = await readSession();
      if (!user) return { user: null };
      return { user };
    },
  };
}

/** The operations Payload's access functions are asked about. */
export type AdminPayloadOperation = "read" | "create" | "update" | "delete";

/**
 * The permission adapter, backed by Payload's access functions.
 *
 * Helmdeck's shell asks "may this session do this", and the answer is Payload's own access
 * function for the collection and the operation, called with the session's user. The host's rule
 * stays the rule; the shell does not get a second one.
 */
export function createAdminPayloadPermissionsAdapter({
  access,
  resolveUser,
}: {
  /** The host's access functions, the same ones Payload asks. */
  access: Partial<Record<AdminPayloadOperation, (args: { user: AdminPayloadUser | null }) => boolean | Promise<boolean>>>;
  resolveUser: AdminPayloadSessionReader;
}) {
  return {
    can: async (permission: string, context: { operation?: AdminPayloadOperation } = {}) => {
      const operation = context.operation ?? "read";
      const rule = access[operation];
      if (!rule) return false;
      const user = await resolveUser();
      if (!user) return false;
      return Boolean(await rule({ user }));
    },
  };
}
