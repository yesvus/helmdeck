// SPDX-License-Identifier: MIT
import type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminPermission,
  AdminPersistenceAdapter,
  AdminSession,
} from "../adapters/index.js";
import { parseAdminResourceQuery } from "../adapters/query.js";
import type { AdminResourcePage, AdminResourceQuery } from "../adapters/query.js";
import type { AdminPermissionGuard } from "../shell/permission-rule.js";
import {
  adminResourceReferenceValue,
  type AdminResourceDefinition,
  type AdminResourceRecord,
  type AdminResourceReference,
} from "./registry.js";

export type AdminResourceOperation = "read" | "create" | "update" | "delete";

/** The operations that change something, which is the set the audit and cache halves are told about. */
type AdminWriteOperation = Exclude<AdminResourceOperation, "read">;

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
 * The id the store settled on, or nothing.
 *
 * A write that succeeded cannot be turned back into a failure by a record that happens to carry no
 * id, so this reads the id rather than demanding one the way a route building a link from a record
 * has to.
 */
function storedId(record: unknown): string | undefined {
  const id = record && typeof record === "object" ? (record as { id?: unknown }).id : undefined;
  if (typeof id === "string" && id.length > 0) return id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return undefined;
}

/**
 * The names of the fields the stored record holds, which is the shape of the write and not a diff.
 *
 * Names rather than values on purpose: an audit log holding every value a record ever had is a second
 * copy of every secret in the table. A host that wants the values keeps them where the change is
 * reversible from, which is the host's own revision store rather than this event.
 */
function storedFields(record: unknown): string[] | undefined {
  if (!record || typeof record !== "object") return undefined;
  const fields = Object.keys(record as Record<string, unknown>)
    .filter((key) => key !== "id")
    .sort();
  return fields.length > 0 ? fields : undefined;
}

/**
 * The event one write leaves, describing the write that happened.
 *
 * A create names the id the store assigned, which is the other reason the event is built after the
 * effect: before it, a create has no record to name, and a trail that cannot name a new record is not
 * the history of anything. A delete names the record it removed and no fields, because what it held
 * is not in the store any more and reading it first is a choice left to the host.
 */
function writeEvent({
  operation,
  resource,
  resourceId,
  session,
  record,
}: {
  operation: AdminWriteOperation;
  resource: string;
  resourceId?: string;
  session: AdminSession;
  record?: unknown;
}): AdminAuditEvent {
  const named = resourceId ?? storedId(record);
  const fields = storedFields(record);
  return {
    action: operation,
    resource,
    ...(named === undefined ? {} : { resourceId: named }),
    actor: session,
    occurredAt: new Date().toISOString(),
    ...(fields === undefined ? {} : { metadata: { fields } }),
  };
}

/**
 * Refused because a value names a row the store does not hold.
 *
 * A write is refused rather than stored, because a stored value naming nothing is a claim the store
 * cannot back and every later read has to make sense of: a list would print a marker where a
 * customer was, and a form would offer a choice that resolves to nothing. Refusing names the field
 * and the value, so the author of the write learns which reference was wrong rather than that a
 * write was wrong.
 *
 * Distinct from a permission refusal on purpose. A value this write newly names, pointing at a
 * resource this session may not read, is refused by the guard, identically whether the row exists or
 * not, so the answer cannot be used to ask which rows another resource holds. A value the record
 * already held is not checked at all, so it never gets here.
 */
export class AdminResourceReferenceError extends Error {
  readonly resource: string;
  readonly field: string;
  readonly value: string;
  readonly target: string;

  constructor(input: { resource: string; field: string; value: string; target: string }) {
    super(
      `${input.resource}.${input.field} names ${JSON.stringify(input.value)}, which no ${input.target} row carries`,
    );
    this.name = "AdminResourceReferenceError";
    this.resource = input.resource;
    this.field = input.field;
    this.value = input.value;
    this.target = input.target;
  }
}

/** One value in a write that names a row, and the row it claims to name. */
type Asked = { field: string; reference: AdminResourceReference; value: string };

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
 * refusal of the request rather than a button that was never drawn. A write that gets through is
 * then reported to whichever of `audit` and `cache` the host wired, after the store has answered.
 *
 * ```ts
 * export const actions = createAdminResourceActions({
 *   guard: requirePermission,
 *   persistence,
 *   expose: exposedResource,
 *   permission: (resource, operation) => `${resource}.${operation}` as AdminPermission,
 *   audit,
 *   cache,
 * });
 * ```
 */
export function createAdminResourceActions({
  guard,
  persistence,
  expose,
  permission = (resource, operation) => `${resource}.${operation}` as AdminPermission,
  before,
  audit,
  cache,
  onAdapterError,
  definitions,
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
  /**
   * Told about every write that reached the store, and told about it afterwards.
   *
   * After the effect, because that is the only order in which the event can be true. A record written
   * first and left behind when the write failed claims a change that did not happen, and nothing in
   * the event tells a reader to doubt it. The price of this choice is the other one: a process that
   * dies between the write and the record leaves a change nobody wrote down, and closing that window
   * is a transactional outbox in the host's own store, which is a schema question rather than a seam
   * one.
   *
   * A refused call records nothing, because nothing happened to record. A store that refused the
   * write records nothing either, which is the same claim from the other direction.
   */
  audit?: AdminAuditAdapter;
  /**
   * Told about the same writes, once the audit record exists, so the trail is complete before
   * anything can read the resource again.
   *
   * A create is told about the resource rather than about the record it made: a record no read has
   * returned yet has no key in the host's cache, and what a create invalidates is the collection it
   * joined. The record a call named is the one passed, because that is the key a read of it cached.
   */
  cache?: AdminCacheInvalidationAdapter;
  /**
   * Where a rejected adapter goes.
   *
   * The rejection is not raised at the caller. The write has already happened, so failing here would
   * report an error on a save that worked, which is how a person loses confidence in the very thing
   * they were protecting. Swallowed failures are invisible failures, so this is how a host notices
   * that its own audit log has stopped being written.
   */
  onAdapterError?: (
    cause: unknown,
    input: {
      adapter: "audit" | "cache";
      operation: AdminWriteOperation;
      resource: string;
      resourceId?: string;
    },
  ) => void;
  /**
   * The definitions a write is checked against, read for the references they declare and nothing
   * else. Optional, and its absence is not a weaker boundary: a write carrying a value that names a
   * row is checked as far as the definitions say it can be, and a host that declares none has
   * declared no references to check.
   */
  definitions?: readonly AdminResourceDefinition[];
}): AdminResourceActions {
  if (typeof guard !== "function") {
    throw new Error(
      "createAdminResourceActions needs a guard. These calls are the boundary where a resource name " +
        "from the browser becomes a capability, so without one there is nothing that decides and the " +
        "actions are not created at all.",
    );
  }

  const declared = new Map<string, AdminResourceDefinition>();
  for (const definition of definitions ?? []) declared.set(definition.resource, definition);

  /**
   * Every value in a write that names a row, and the row it claims to name.
   *
   * A field is checked by reading the target, which is the whole of how a value comes to name a row:
   * the store is asked, rather than the write being compared against the list of choices the browser
   * was drawn from, so a value outside a window of choices is still a value the store can answer for.
   */
  function referencesIn(resource: string, value: unknown): Asked[] {
    const definition = declared.get(resource);
    if (definition === undefined) return [];
    const incoming = (value ?? {}) as Record<string, unknown>;
    const asked: Asked[] = [];
    for (const field of definition.fields) {
      if (field.reference === undefined) continue;
      const named = adminResourceReferenceValue(incoming[field.name]);
      if (named === null) continue;
      asked.push({ field: field.name, reference: field.reference, value: named });
    }
    return asked;
  }

  /**
   * Whether a value is the one the record already holds, read the way the write was.
   *
   * A stored id is a number where a form's is a string, so both go through the same reader: a
   * comparison of what arrived would call `7` a change on a record holding `7`, and check a reference
   * the write never touched.
   */
  function heldBefore(stored: AdminResourceRecord | null, asked: Asked): boolean {
    return stored !== null && adminResourceReferenceValue(stored[asked.field]) === asked.value;
  }

  /**
   * A write refused unless every value it newly names is one the store holds.
   *
   * `recordId` is the record an update is about to replace, and it is what separates a create from an
   * update here. A create has none, so every value it carries is one this write is asserting. An
   * update has one, and a value the record already holds is not this write's to check: it did not put
   * that value there, so its author is asserting nothing about a resource they may not be allowed to
   * read, and a check would make a record holding such a value uneditable by the people who may edit
   * it. The form already promises the other half of that, offering the value a control cannot show
   * rather than dropping it, and the two halves of a reference have to agree or a form draws a save
   * the server refuses. What a write *changes* a value to is still checked in full.
   *
   * The cost is one read of the record being written, and only on a write that names a reference at
   * all: a resource with no reference in it, or a write with nothing named in it, reads nothing here
   * that it did not read before. That read goes straight to the adapter rather than through `permit`,
   * because the update has already been decided on that record and asking again would run the host's
   * `before` hook twice for one write. A record that cannot be read leaves nothing to compare against,
   * so its values are checked as a create's are. What the comparison reveals is the record's own
   * stored value, which is the caller's to write, and nothing about whether the target holds it.
   *
   * A changed value is read through `permit` first, so one naming a resource this session may not
   * read is refused by the guard, and identically whether or not the row is there. That is what stops
   * a reference from becoming a way to ask about another resource's rows: the answer to "is this id
   * real" cannot differ for a session not allowed to read the table.
   *
   * One hop, so a self-referencing column terminates here as it does in a view: a value names a row,
   * and whether that row's own values are references is a question this never asks.
   */
  async function checkReferences(resource: string, value: unknown, recordId?: string) {
    const asked = referencesIn(resource, value);
    if (asked.length === 0) return;
    const stored =
      recordId === undefined ? null : await persistence.read<AdminResourceRecord>(resource, recordId);
    for (const one of asked) {
      if (heldBefore(stored, one)) continue;
      await permit(one.reference.resource, "read", one.value);
      const found = await persistence.read(one.reference.resource, one.value);
      if (found === null) {
        throw new AdminResourceReferenceError({
          resource,
          field: one.field,
          value: one.value,
          target: one.reference.resource,
        });
      }
    }
  }

  async function permit(
    resource: string,
    operation: AdminResourceOperation,
    resourceId?: string,
  ): Promise<AdminSession> {
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
    const session = await guard(name, context);
    await before?.({ resource, operation, resourceId });
    // The session travels back so the write that follows can be recorded against the person the
    // guard decided for, rather than against a resolver the seam would have to ask a second time.
    return session;
  }

  /**
   * The two optional halves of a write that has already happened, in the order they happen.
   *
   * The record goes first because it is the half that cannot be redone: a cache that was not
   * invalidated is stale until something invalidates it, and a change nobody wrote down is gone. The
   * cost of this order is the mirror image, which is that a process dying between the two leaves a
   * read that can still be served the old value while the trail already says the record changed.
   *
   * A host that wired neither reaches only the two conditions below and nothing else, so no event is
   * built and no clock is read for a trail nobody receives.
   */
  async function reported(input: {
    operation: AdminWriteOperation;
    resource: string;
    /** The record the call named, which is none at all for a create. */
    resourceId?: string;
    session: AdminSession;
    /** What the store returned, which for a create is the only place its id exists. */
    record?: unknown;
  }): Promise<void> {
    const { operation, resource, resourceId } = input;
    if (audit) {
      try {
        await audit.record(writeEvent(input));
      } catch (cause) {
        onAdapterError?.(cause, { adapter: "audit", operation, resource, resourceId });
      }
    }
    if (cache) {
      try {
        await cache.invalidate({ resource, resourceId, operation });
      } catch (cause) {
        onAdapterError?.(cause, { adapter: "cache", operation, resource, resourceId });
      }
    }
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
      const session = await permit(resource, "create");
      // After the refusal and before the store, so a value naming a row that is not there never
      // reaches a table to be stored and then have to be un-stored.
      await checkReferences(resource, value);
      const created = await persistence.create<T>(resource, value);
      await reported({ operation: "create", resource, session, record: created });
      return created;
    },

    async update<T>(resource: string, id: string, value: unknown): Promise<T> {
      const session = await permit(resource, "update", id);
      // After the refusal and before the store, with the record it is about to replace, so a value
      // the record already holds is not this write's to check.
      await checkReferences(resource, value, id);
      const updated = await persistence.update<T>(resource, id, value);
      await reported({ operation: "update", resource, resourceId: id, session, record: updated });
      return updated;
    },

    async delete(resource: string, id: string): Promise<void> {
      const session = await permit(resource, "delete", id);
      await persistence.delete(resource, id);
      await reported({ operation: "delete", resource, resourceId: id, session });
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
