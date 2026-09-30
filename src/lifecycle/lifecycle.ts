// SPDX-License-Identifier: MIT
import type {
  AdminAuditAdapter,
  AdminAuditEvent,
  AdminCacheInvalidationAdapter,
  AdminPermission,
  AdminPersistenceAdapter,
  AdminResourcePage,
  AdminResourceQuery,
  AdminSession,
} from "../adapters/index.js";
import type { AdminResourceRecord } from "../resources/registry.js";
import type { AdminPermissionGuard } from "../shell/permission-rule.js";
import {
  AdminLifecycleChildError,
  AdminLifecycleNotDeclaredError,
  AdminLifecycleScopeError,
  AdminLifecycleStateError,
  AdminRevisionDriftError,
  AdminRevisionUnknownError,
  type AdminLifecycleRecordState,
  type AdminLifecycleReferrer,
} from "./errors.js";
import {
  adminRevision,
  byNewestRevision,
  revisionIdOf,
  type AdminRevision,
  type AdminRevisionStore,
} from "./revisions.js";

/**
 * The five capabilities this layer adds to the four a resource already has.
 *
 * **A separate union from `AdminResourceOperation`, and that is the decision rather than an
 * accident.** `AdminResourceOperation` is the vocabulary every generated list and form switches on,
 * and a host that switches exhaustively over it is the exact consumer a widening breaks, at compile
 * time, in every file that does. Adding four members would make "restore a version of a post" a
 * breaking change for a host that only ever wanted a trash, and the price of the separate union is
 * one more string in a permission name. Below 1.0 a consumer has no signal about what a minor may
 * take, which is why this repository's surface gate treats removals as build failures rather than
 * leaving them to convention, and a widening is a removal of the guarantee that those four are all
 * of them.
 *
 * `recordRevision` is absent, and deliberately so: recording what a change replaced is not a change,
 * and a permission on it would fuse the two, so that a host wiring it beside its content action can
 * have the decision about the content made and then have the history fail to record. It takes the
 * session it was called with instead.
 */
export type AdminResourceLifecycleOperation =
  | "readRevisions"
  | "restoreRevision"
  | "softDelete"
  | "restoreFromTrash"
  | "purge";

/**
 * Rows that point at this one, and what happens to them when it is taken away.
 *
 * A reference left pointing at nothing is not cosmetic. The write boundary refuses a value naming a
 * row the store does not hold, so orphaning rows makes them uneditable by anyone afterwards, which is
 * a worse outcome than a visible refusal. So the default refuses and names them, and a host states
 * which of the three real answers it meant.
 */
export type AdminChildDeclaration = {
  /** The resource the referencing rows live in. */
  resource: string;
  /** The column of that resource holding the value naming the record. A column, not a path. */
  field: string;
  /**
   * `"refuse"` by default.
   *
   * `"trash"` brings the referencing rows into the same move and follows their own declarations, so a
   * post takes its comments with it and a cycle of references terminates. `"keep"` leaves them alone
   * and states that a row whose target is gone is acceptable, which is what a host whose listings
   * already tolerate a missing target wants.
   */
  on?: "refuse" | "trash" | "keep";
};

/** What this layer knows about one resource. */
export type AdminLifecycleDeclaration = {
  resource: string;
  /**
   * The resource deleted rows move into, which a host names because a host created that table and
   * this layer will not guess a name it has not checked exists.
   *
   * Optional, because a history and a trash are two independent things and a host may want either
   * without the other. A resource with no trash keeps its revision history and every refusal a
   * history implies, and refuses a soft delete rather than moving a row somewhere the host has not
   * built. A host that declares one gets a trash; a host that does not is not obliged to create a
   * table to satisfy a feature it did not ask for.
   */
  trash?: string;
  /** The revision columns, for a resource whose records have a history. */
  revisions?: AdminRevisionStore;
  /** Rows pointing at this one. Absent means this layer is told nothing points at them. */
  children?: readonly AdminChildDeclaration[];
};

/** What one restore did, in the three places a snapshot can disagree with the record. */
export type AdminRevisionRestore = {
  /** The record as it now reads, through the same store the whole admin reads through. */
  record: AdminResourceRecord;
  /** The revision recorded for the restore itself, which is what made it reversible. */
  revision: AdminRevision;
  /** The fields the revision held and the record had, so the fields it put back. */
  written: string[];
  /** Fields the record holds that the revision did not, left exactly as they were. */
  retained: string[];
  /**
   * Fields the revision held and the record no longer has. Empty unless the caller passed them in
   * `dropFields`, because otherwise the restore refused instead of answering.
   */
  dropped: string[];
};

/** What one move took, including everything a child declaration brought with it. */
export type AdminLifecycleMove = {
  resource: string;
  id: string;
  /** Where the rows went. */
  trash: string;
  /** Every row moved, the named one first, so a caller sees the whole effect and not only its own. */
  moved: Array<{ resource: string; id: string }>;
  /** The named row as it now reads in its new home. */
  record: AdminResourceRecord;
};

/** What a caller accepts losing from a restore, by name. */
export type AdminRevisionRestoreOptions = {
  /**
   * Fields the revision holds and the record no longer has, which the caller accepts losing.
   *
   * A list of names rather than a boolean, because the fields differ per restore and a caller who
   * means one column today does not mean the next one dropped next year.
   */
  dropFields?: readonly string[];
};

export type AdminRevisionRecordOptions = {
  /** Why the record is about to change. Defaults to `edit`. */
  cause?: string;
  /** Who asked for it, which the host's `write` turns into whatever columns its history carries. */
  session?: AdminSession | null;
};

/**
 * One resource's trash, as the persistence adapter the generated list already takes.
 *
 * Reads are the trash's own rows and nothing else, so a list mounted on this cannot show a live row
 * however it is driven. The writes are refused rather than forwarded: a list's row controls call
 * `update`, and forwarding that would let a person edit a trashed row and have the edit land in the
 * trash. `delete` goes through `purge` instead, which is the checked way to do the same irreversible
 * thing, so mounting a list on a trash is enough to get a guarded hard delete rather than a raw one.
 */
export type AdminLifecycleScope = AdminPersistenceAdapter & {
  /** The one resource this scope answers for. */
  readonly resource: string;
  /** The live resource the trash was cut from. */
  readonly live: string;
};

export type AdminLifecycle = {
  /** A record's history, newest first. */
  revisions: (resource: string, id: string) => Promise<AdminRevision[]>;
  /**
   * Records the state a change is about to replace.
   *
   * Asks no permission, because it decides nothing about whether the change may happen. A host calls
   * it from beside its own content action, after its own rule has already allowed the write, and the
   * two are separate calls rather than one. That is the whole difference from recording history inside
   * the audit write, which makes the history depend on the audit sink being wired and puts a history
   * entry in the path of every change whether or not anybody reads it.
   */
  recordRevision: (
    resource: string,
    id: string,
    options?: AdminRevisionRecordOptions,
  ) => Promise<AdminRevision>;
  /** Puts a recorded version back on a live record. */
  restoreRevision: (
    resource: string,
    id: string,
    revision: string,
    options?: AdminRevisionRestoreOptions,
  ) => Promise<AdminRevisionRestore>;
  /** Moves a live record into its trash. */
  softDelete: (resource: string, id: string) => Promise<AdminLifecycleMove>;
  /** Moves a trashed record back into its resource. */
  restoreFromTrash: (resource: string, id: string) => Promise<AdminLifecycleMove>;
  /** Removes a trashed record for good. */
  purge: (resource: string, id: string) => Promise<void>;
  /** The trash of one resource, as an adapter for the generated list. */
  trash: (resource: string) => AdminLifecycleScope;
};

/** Now. Read from the process and never from a caller: an occurrence time is not an input. */
function occurredAt(): string {
  return new Date().toISOString();
}

/**
 * The cause this package writes for the one write it makes itself.
 *
 * `restore`, and not a name of its own, because this value lands in the host's own history table
 * beside the host's own causes and is therefore constrained by whatever the host's schema allows.
 * The demo's `post_revisions` already carries `CHECK (cause IN ('edit', 'publish', 'unpublish',
 * 'restore'))`, so this is the one spelling a content host can adopt without a migration. A host
 * whose enum spells it differently maps it in `write`, which is handed the cause and is the one
 * place that decides what a column gets.
 */
const RESTORE_CAUSE = "restore";

export function createAdminLifecycle({
  guard,
  persistence,
  resources,
  permission = (resource, operation) => `${resource}.${operation}` as AdminPermission,
  audit,
  cache,
  onAdapterError,
}: {
  guard: AdminPermissionGuard;
  persistence: AdminPersistenceAdapter;
  resources: readonly AdminLifecycleDeclaration[];
  permission?: (resource: string, operation: AdminResourceLifecycleOperation) => AdminPermission;
  audit?: AdminAuditAdapter;
  cache?: AdminCacheInvalidationAdapter;
  onAdapterError?: (
    cause: unknown,
    input: { adapter: "audit" | "cache"; operation: string; resource: string; resourceId?: string },
  ) => void;
}): AdminLifecycle {
  if (typeof guard !== "function") {
    throw new Error(
      "createAdminLifecycle needs a guard. These calls move records between a resource and its trash " +
        "and put old content back, so without one there is nothing deciding and they are not created.",
    );
  }

  const declared = new Map<string, AdminLifecycleDeclaration>();
  for (const declaration of resources) declared.set(declaration.resource, declaration);

  function lifecycleOf(resource: string): AdminLifecycleDeclaration {
    const found = declared.get(resource);
    if (found === undefined) throw new AdminLifecycleNotDeclaredError(resource, "trash");
    return found;
  }

  function revisionsOf(resource: string): AdminRevisionStore {
    const store = lifecycleOf(resource).revisions;
    if (store === undefined) throw new AdminLifecycleNotDeclaredError(resource, "revisions");
    return store;
  }

  /**
   * The trash of a resource, or a refusal.
   *
   * Refused at the point of use rather than at construction, so a host that declares a resource for
   * its history alone and no trash gets a clean answer to a soft delete rather than a declaration
   * error naming a field it never filled in.
   */
  function trashOf(resource: string): string {
    const found = lifecycleOf(resource).trash;
    if (found === undefined) throw new AdminLifecycleNotDeclaredError(resource, "trash");
    return found;
  }

  /**
   * The decision, before anything is read or written.
   *
   * Refused before the session is resolved for the reason `createAdminResourceActions` refuses
   * there: a name outside the declared set is a wiring fault, and turning it into a permission
   * question would tell a caller which names are worth asking about.
   */
  async function permit(
    resource: string,
    operation: AdminResourceLifecycleOperation,
    id?: string,
  ): Promise<AdminSession> {
    lifecycleOf(resource);
    const name = permission(resource, operation);
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`No permission name is declared for ${operation} ${resource}`);
    }
    return guard(name, id === undefined ? undefined : { resourceId: id });
  }

  /**
   * Where a record is, in both places at once, because every operation here turns on which.
   *
   * Two reads per call, and they are what make each refusal name the state instead of a symptom. A
   * caller restoring a row that was never deleted is told `live`; one deleting it twice is told
   * `trashed`; and a row in both is told `both`, which is the state a half-finished move leaves
   * behind and the one this layer refuses to resolve on its own.
   */
  async function stateOf(resource: string, id: string): Promise<{
    state: AdminLifecycleRecordState;
    live: AdminResourceRecord | null;
    trashed: AdminResourceRecord | null;
  }> {
    const { trash } = lifecycleOf(resource);
    const live = await persistence.read<AdminResourceRecord>(resource, id);
    // The trash is only read when the host declared one, so a resource with a history and no trash
    // keeps its history without having to have built a table to read.
    if (trash === undefined) return { state: live === null ? "missing" : "live", live, trashed: null };
    const trashed = await persistence.read<AdminResourceRecord>(trash, id);
    return {
      state:
        live !== null && trashed !== null
          ? "both"
          : live !== null
            ? "live"
            : trashed !== null
              ? "trashed"
              : "missing",
      live,
      trashed,
    };
  }

  function stateRefusal(
    resource: string,
    id: string,
    state: AdminLifecycleRecordState,
    operation: string,
  ): AdminLifecycleStateError {
    return new AdminLifecycleStateError({
      resource,
      id,
      trash: lifecycleOf(resource).trash ?? null,
      state,
      operation,
    });
  }

  /** Rows of one child resource holding a value that names this record. */
  async function referringTo(
    childResource: string,
    field: string,
    id: string,
  ): Promise<AdminResourceRecord[]> {
    const rows = await persistence.query<AdminResourceRecord>(childResource, { [field]: id });
    return rows.filter((row) => row !== null && typeof row === "object" && typeof row.id === "string");
  }

  /** The child declarations that would be broken by taking a record away, and the rows doing it. */
  async function blockingReferrers(
    resource: string,
    id: string,
    include: (on: AdminChildDeclaration["on"]) => boolean,
  ): Promise<AdminLifecycleReferrer[]> {
    const blocking: AdminLifecycleReferrer[] = [];
    for (const child of lifecycleOf(resource).children ?? []) {
      if (!include(child.on)) continue;
      const rows = await referringTo(child.resource, child.field, id);
      if (rows.length > 0) blocking.push({ resource: child.resource, field: child.field, rows });
    }
    return blocking;
  }

  /**
   * Every row one trash takes, and the refusal when it cannot be taken.
   *
   * The whole walk is read before anything is written, which is the property that makes the refusal
   * safe. A cascade that trashed as it walked would leave rows in their trash tables and in their live
   * ones when the walk reached a reference it was not allowed to break, and the host would be left
   * repairing a partial move by hand. A refusal costs some reads; a refusal halfway through costs
   * correctness.
   *
   * `seen` is what terminates a cycle. Two rows pointing at each other is a modelling mistake rather
   * than a crash, and the set turns it into one round of the walk.
   */
  async function planTrash(root: string, id: string): Promise<Array<{ resource: string; id: string }>> {
    const plan: Array<{ resource: string; id: string }> = [];
    const seen = new Set<string>();
    const queue: Array<{ resource: string; id: string }> = [{ resource: root, id }];

    while (queue.length > 0) {
      const next = queue.shift()!;
      const key = `${next.resource} ${next.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plan.push(next);

      const refusals: AdminLifecycleReferrer[] = [];
      for (const child of lifecycleOf(next.resource).children ?? []) {
        if (child.on === "keep") continue;
        const rows = await referringTo(child.resource, child.field, next.id);
        if (rows.length === 0) continue;
        if (child.on === "trash") {
          for (const row of rows) queue.push({ resource: child.resource, id: row.id });
          continue;
        }
        refusals.push({ resource: child.resource, field: child.field, rows });
      }
      if (refusals.length > 0) throw new AdminLifecycleChildError(next.resource, next.id, refusals);
    }
    return plan;
  }

  /**
   * The two optional halves of a move that has already happened, in the order they happen.
   *
   * The record goes first for the reason it does everywhere else in this package: a cache that was
   * not invalidated is stale until something invalidates it, and a change nobody wrote down is gone.
   * Every key the move touched is named, because a row that left a list and joined another is two
   * keys and one of them left holding a row that is no longer there.
   */
  async function reported(input: {
    operation: string;
    resource: string;
    resourceId: string;
    session: AdminSession;
    metadata?: Record<string, unknown>;
    invalidations: Array<{
      resource: string;
      resourceId?: string;
      operation: "create" | "update" | "delete";
    }>;
  }): Promise<void> {
    if (audit) {
      const event: AdminAuditEvent = {
        action: input.operation,
        resource: input.resource,
        resourceId: input.resourceId,
        actor: input.session,
        occurredAt: occurredAt(),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      };
      try {
        await audit.record(event);
      } catch (cause) {
        onAdapterError?.(cause, {
          adapter: "audit",
          operation: input.operation,
          resource: input.resource,
          resourceId: input.resourceId,
        });
      }
    }
    if (cache) {
      for (const invalidation of input.invalidations) {
        try {
          await cache.invalidate(invalidation);
        } catch (cause) {
          onAdapterError?.(cause, {
            adapter: "cache",
            operation: input.operation,
            resource: invalidation.resource,
            ...(invalidation.resourceId === undefined ? {} : { resourceId: invalidation.resourceId }),
          });
        }
      }
    }
  }

  async function historyOf(resource: string, id: string): Promise<AdminRevision[]> {
    const store = revisionsOf(resource);
    const rows = await persistence.query<AdminResourceRecord>(store.resource, { [store.record]: id });
    return rows
      .filter((row) => row !== null && typeof row === "object")
      .map((row) => adminRevision(store, row, resource))
      .sort(byNewestRevision);
  }

  /**
   * Writes the state a change is about to replace, as one more entry in the same history.
   *
   * Whole rows, and the ordering is read from the whole of the existing history rather than from a
   * clock: two saves in the same millisecond are two distinct changes, and a history ordered by time
   * cannot say which came first. The id is derived from the position, so two callers racing for the
   * same position ask the store for the same id and the second write is refused by the store rather
   * than overwriting the first. A history entry lost to a race is a change nobody can get back.
   */
  async function recordFrom(
    resource: string,
    live: AdminResourceRecord,
    cause: string,
    session: AdminSession | null,
    restoredFrom: string | null,
  ): Promise<AdminRevision> {
    const store = revisionsOf(resource);
    const history = await historyOf(resource, live.id);
    let highest = 0;
    for (const revision of history) highest = Math.max(highest, revision.position);
    const position = highest + 1;
    const id = revisionIdOf(store, { recordId: live.id, position });
    const written = store.write({
      id,
      recordId: live.id,
      position,
      cause,
      snapshot: { ...live },
      session,
      restoredFrom,
      occurredAt: occurredAt(),
    });
    // The layer's own columns are laid over whatever `write` produced, rather than left to the order
    // the host happened to spread things in. A store that keeps the whole record will spread an `id`
    // and a `position` over the revision's, and the result is a history where the second revision
    // overwrites the first: the uniqueness the position scheme depends on is exactly what a
    // projection is most likely to take away. These are the columns the layer reads back, so they are
    // the columns it writes.
    const row: Record<string, unknown> = {
      ...(written as Record<string, unknown>),
      id,
      [store.record]: live.id,
      [store.position]: position,
      [store.cause]: cause,
      ...(store.restoredFrom === undefined ? {} : { [store.restoredFrom]: restoredFrom }),
    };
    const created = await persistence.create<AdminResourceRecord>(store.resource, row);
    return adminRevision(store, created, resource);
  }

  /**
   * What a restore writes, what it leaves, and what it cannot bring back.
   *
   * Three cases, and the design is that none of them is silent:
   *
   * A field the revision holds and the record has is **written**, which is what restores a value
   * somebody deliberately cleared. A revision recording only what changed cannot do this, since a
   * cleared field is indistinguishable from an untouched one, and this layer records whole rows for
   * exactly that reason.
   *
   * A field the record holds and the revision does not is **retained**, left as it is. A column added
   * after the revision was taken has no value in it to bring back, and the two things that can be
   * done about that are keep the current value or null it. Nulling is the quiet one, and a restore
   * that silently clears a column somebody added last month is worse than one that admits the
   * snapshot predates it. So it is kept, and named in `retained` so the caller sees what was not
   * touched.
   *
   * A field the revision holds and the record does not is **refused**, because a column dropped since
   * cannot be brought back, and writing it would either fail or discard a value without saying which.
   * The refusal names them; the caller passes them in `dropFields` to accept losing them, and they
   * come back in `dropped` on the result, so an accepted loss is still a stated one.
   */
  function restorationOf(
    snapshot: Record<string, unknown>,
    live: AdminResourceRecord,
    accepted: readonly string[],
  ): { written: string[]; retained: string[]; dropped: string[]; refused: string[] } {
    const written: string[] = [];
    const dropped: string[] = [];
    const mayDrop = new Set(accepted);

    for (const field of Object.keys(snapshot)) {
      if (field === "id") continue;
      if (!Object.prototype.hasOwnProperty.call(live, field)) {
        dropped.push(field);
        continue;
      }
      written.push(field);
    }

    const restored = new Set(written);
    return {
      written: written.sort(),
      retained: Object.keys(live)
        .filter((field) => field !== "id" && !restored.has(field))
        .sort(),
      dropped: dropped.sort(),
      refused: dropped.filter((field) => !mayDrop.has(field)).sort(),
    };
  }

  /**
   * One move, applied.
   *
   * Each row is read at the point it is written rather than trusted from the walk, so a row removed
   * in between is reported as the state it is in rather than moved from a copy that is gone.
   *
   * Into the trash before out of the resource. The other order loses the row outright when the second
   * write fails, and a row in both places is a state this layer can name and refuse, so the next call
   * about it says so. A lost row is neither.
   */
  async function applyMove(
    plan: Array<{ resource: string; id: string }>,
    root: { resource: string; id: string },
  ): Promise<AdminLifecycleMove> {
    for (const entry of plan) {
      const row = await persistence.read<AdminResourceRecord>(entry.resource, entry.id);
      if (row === null) throw stateRefusal(entry.resource, entry.id, "missing", "moved");
      await persistence.create(trashOf(entry.resource), row);
      await persistence.delete(entry.resource, entry.id);
    }

    const trash = trashOf(root.resource);
    const stored = await persistence.read<AdminResourceRecord>(trash, root.id);
    if (stored === null) {
      throw stateRefusal(root.resource, root.id, "missing", "moved, because it is in neither table");
    }
    return { resource: root.resource, id: root.id, trash, moved: plan, record: stored };
  }

  const lifecycle: AdminLifecycle = {
    async revisions(resource, id) {
      await permit(resource, "readRevisions", id);
      return historyOf(resource, id);
    },

    async recordRevision(resource, id, options = {}) {
      const where = await stateOf(resource, id);
      if (where.state !== "live") {
        throw stateRefusal(
          resource,
          id,
          where.state,
          "recorded, because a revision describes a record a person can go and read",
        );
      }
      return recordFrom(resource, where.live!, options.cause ?? "edit", options.session ?? null, null);
    },

    async restoreRevision(resource, id, wanted, options = {}) {
      const session = await permit(resource, "restoreRevision", id);
      const where = await stateOf(resource, id);
      if (where.state !== "live") {
        throw stateRefusal(
          resource,
          id,
          where.state,
          "restored, because its revisions belong to a record that is live",
        );
      }

      const history = await historyOf(resource, id);
      // Looked up among this record's own revisions rather than fetched by id. That is the whole of
      // what stops one record's version being put onto another: an id alone is not a capability,
      // because it names a row of the history table and a row of the history table does not know
      // which record it was filed against until its own column says so.
      const target = history.find((revision) => revision.id === wanted);
      if (target === undefined) throw new AdminRevisionUnknownError({ resource, id, revision: wanted });

      const plan = restorationOf(target.snapshot, where.live!, options.dropFields ?? []);
      if (plan.refused.length > 0) {
        throw new AdminRevisionDriftError({ resource, id, revision: wanted, fields: plan.refused });
      }

      // Recorded before the write, so what the restore replaced is itself in the history and the
      // restore is reversible by restoring what it replaced. Recording afterwards would leave a
      // history that says a version was put back and cannot say what was lost to it.
      const revision = await recordFrom(resource, where.live!, RESTORE_CAUSE, session, target.id);

      // The whole record goes out. A partial write drops every field it did not name, on both of the
      // stores shipped here, so a restore that wrote only the snapshot's fields would clear exactly
      // the columns added since, which is the case this layer exists not to lose quietly.
      const restored: AdminResourceRecord = { ...where.live! };
      for (const field of plan.written) restored[field] = target.snapshot[field];
      const stored = await persistence.update<AdminResourceRecord>(resource, id, restored);

      await reported({
        operation: "restoreRevision",
        resource,
        resourceId: id,
        session,
        metadata: {
          revision: wanted,
          fields: plan.written,
          retained: plan.retained,
          dropped: plan.dropped,
        },
        invalidations: [{ resource, resourceId: id, operation: "update" }],
      });

      return { record: stored, revision, written: plan.written, retained: plan.retained, dropped: plan.dropped };
    },

    async softDelete(resource, id) {
      const session = await permit(resource, "softDelete", id);
      trashOf(resource);
      const where = await stateOf(resource, id);
      if (where.state !== "live") throw stateRefusal(resource, id, where.state, "trashed");
      const move = await applyMove(await planTrash(resource, id), { resource, id });
      await reported({
        operation: "softDelete",
        resource,
        resourceId: id,
        session,
        metadata: { moved: move.moved, trash: move.trash },
        invalidations: [
          { resource, resourceId: id, operation: "delete" },
          { resource: move.trash, resourceId: id, operation: "create" },
        ],
      });
      return move;
    },

    async restoreFromTrash(resource, id) {
      const session = await permit(resource, "restoreFromTrash", id);
      trashOf(resource);
      const where = await stateOf(resource, id);
      if (where.state !== "trashed") {
        throw stateRefusal(resource, id, where.state, "restored, because it is not in the trash");
      }
      const trash = trashOf(resource);
      await persistence.create(resource, where.trashed!);
      await persistence.delete(trash, id);
      const move: AdminLifecycleMove = {
        resource,
        id,
        trash,
        moved: [{ resource, id }],
        record: { ...where.trashed! },
      };
      await reported({
        operation: "restoreFromTrash",
        resource,
        resourceId: id,
        session,
        metadata: { moved: move.moved, trash: move.trash },
        invalidations: [
          { resource, resourceId: id, operation: "create" },
          { resource: move.trash, resourceId: id, operation: "delete" },
        ],
      });
      return move;
    },

    async purge(resource, id) {
      const session = await permit(resource, "purge", id);
      trashOf(resource);
      const where = await stateOf(resource, id);
      if (where.state !== "trashed") {
        throw stateRefusal(resource, id, where.state, "purged, because it is not in the trash");
      }
      // The same question a trash asks, asked once more and on its own. A trash moves a row somewhere
      // it can be found again; this is the operation that actually leaves the rows pointing at it
      // with nothing there, and the only one whose effect cannot be undone by the row coming back.
      const blocking = await blockingReferrers(resource, id, (on) => on === undefined || on === "refuse");
      if (blocking.length > 0) throw new AdminLifecycleChildError(resource, id, blocking);

      const trash = trashOf(resource);
      await persistence.delete(trash, id);
      await reported({
        operation: "purge",
        resource,
        resourceId: id,
        session,
        invalidations: [{ resource: trash, resourceId: id, operation: "delete" }],
      });
    },

    trash(resource) {
      const trash = trashOf(resource);
      const refuse = (asked: string, operation: string, id?: string): never => {
        throw new AdminLifecycleScopeError({ resource, trash, asked, operation, ...(id === undefined ? {} : { id }) });
      };
      const scope: AdminLifecycleScope = {
        resource: trash,
        live: resource,
        async read<T>(asked: string, id: string): Promise<T | null> {
          if (asked !== trash) refuse(asked, "read", id);
          return persistence.read<T>(trash, id);
        },
        async query<T>(asked: string, query?: Record<string, unknown>): Promise<T[]> {
          if (asked !== trash) refuse(asked, "queried");
          return persistence.query<T>(trash, query);
        },
        async create<T>(asked: string): Promise<T> {
          return refuse(asked, "created");
        },
        async update<T>(asked: string): Promise<T> {
          return refuse(asked, "updated");
        },
        // The one write the scope forwards, because a list's row controls call `delete` and the
        // checked way to remove a trashed row for good is `purge`. Forwarding to the store instead
        // would be the same hard delete without the refusal that protects the rows pointing at it.
        async delete(asked: string, id: string): Promise<void> {
          if (asked !== trash) return refuse(asked, "deleted", id);
          return lifecycle.purge(resource, id);
        },
        ...(typeof persistence.queryPage === "function"
          ? {
            async queryPage<T>(asked: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
              if (asked !== trash) refuse(asked, "paged");
              return persistence.queryPage!<T>(trash, query);
            },
          }
          : {}),
      };
      return scope;
    },
  };

  return lifecycle;
}
