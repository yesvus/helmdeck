// SPDX-License-Identifier: MIT
import type { AdminResourceRecord } from "../resources/registry.js";
import type { AdminSession } from "../adapters/index.js";
import { AdminRevisionMalformedError } from "./errors.js";

/**
 * What one revision records, handed to the store's `write`.
 *
 * The session travels rather than the fields a host copies off it, so the attribution a host's
 * history carries is its own decision and this layer has no opinion about which columns a session
 * turns into. `restoredFrom` is set by a restore and by nothing else, which is what makes a history
 * able to tell a version that was put back from one that was merely written.
 */
export type AdminRevisionWrite = {
  /** The revision's own id, which the store is expected to be able to refuse as a duplicate. */
  id: string;
  /** The record this revision describes. */
  recordId: string;
  /** One past the highest position already recorded, which is the whole of the ordering. */
  position: number;
  /** Why the record was about to change. `restoreRevision` is what this package writes itself. */
  cause: string;
  /** The record as it stands, whole. */
  snapshot: Record<string, unknown>;
  /** Who asked for the change, when the caller knows. */
  session: AdminSession | null;
  /** The revision this one puts back, for a restore. */
  restoredFrom: string | null;
  /** When the change was asked for. Read from the host process, never from a caller. */
  occurredAt: string;
};

/**
 * How a host's revisions are laid out, which is the one thing this layer refuses to decide.
 *
 * A revision is a row in a table the host already has. That is the same call the aggregation layer
 * made and for the same reason: a mechanism that reads host rows works against the schema a host
 * has, and a mechanism that owns a table needs a migration, a table name and a column for every field
 * a resource ever gains. So the shape of a revision row is the host's, and what is declared here is
 * where to find the parts of it.
 *
 * `read` and `write` are the whole of the projection. `read` says what a revision can bring back,
 * and a field it does not return is a field no restore will write; `write` says what the host keeps,
 * and gets the whole record so it can decide what that is. Together they let a host store a revision
 * as a flat row of real columns (as a content table naturally does) or as one JSON document, without
 * this layer caring which, and without either shape needing a migration the other does not.
 */
export type AdminRevisionStore = {
  /** The resource the revision rows live in, which is a name the persistence adapter answers. */
  resource: string;
  /** The column holding the id of the record this revision describes. */
  record: string;
  /** The column ordering revisions. Read as a whole number, and refused when it is not one. */
  position: string;
  /** The column holding why the record changed. */
  cause: string;
  /** The column holding the revision a restore put back, for a host that records one. */
  restoredFrom?: string;
  /**
   * The column holding when the change was asked for. Shown in a history, and never what orders one:
   * two saves in the same millisecond are two changes, and only the position can say which was first.
   */
  occurredAt?: string;
  /** The whole record, read back out of one revision row. */
  read: (revision: AdminResourceRecord) => Record<string, unknown>;
  /** The row to create for a change about to happen. */
  write: (input: AdminRevisionWrite) => unknown;
  /**
   * The revision's id at a position. Deterministic by default, which is the property that matters:
   * two callers recording a change to the same record compute the same position and therefore the
   * same id, so the second write is refused by the store rather than overwriting the first. A
   * history entry lost to a race is a change nobody can get back.
   */
  id?: (input: { recordId: string; position: number }) => string;
};

/** A revision as a caller reads it, which is not the row it is stored as. */
export type AdminRevision = {
  id: string;
  /** The resource the described record belongs to. */
  resource: string;
  recordId: string;
  position: number;
  cause: string;
  restoredFrom: string | null;
  /** When the change was asked for, as an ISO 8601 instant. */
  occurredAt: string;
  /** The record as it stood, as this store's `read` gives it back. */
  snapshot: Record<string, unknown>;
};

export function adminRevisionId(input: { recordId: string; position: number }): string {
  return `${input.recordId}_${input.position}`;
}

export function revisionIdOf(store: AdminRevisionStore, input: { recordId: string; position: number }): string {
  return (store.id ?? adminRevisionId)(input);
}

function required(
  row: AdminResourceRecord,
  column: string,
  store: AdminRevisionStore,
  recordId: string,
): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminRevisionMalformedError({
      revisions: store.resource,
      record: recordId,
      column,
      detail: `is ${JSON.stringify(value)}, which is not a name`,
    });
  }
  return value;
}

function positionOf(row: AdminResourceRecord, store: AdminRevisionStore, recordId: string): number {
  const raw = row[store.position];
  const position = Number(raw);
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw new AdminRevisionMalformedError({
      revisions: store.resource,
      record: recordId,
      column: store.position,
      detail: `is ${JSON.stringify(raw)}, which is not a number`,
    });
  }
  if (!Number.isSafeInteger(position) || position < 1) {
    throw new AdminRevisionMalformedError({
      revisions: store.resource,
      record: recordId,
      column: store.position,
      detail: `is ${JSON.stringify(raw)}, which is not a whole number from one up`,
    });
  }
  return position;
}

/**
 * One stored row as a revision, or a refusal naming the column that is wrong.
 *
 * Every part is checked rather than assumed. The cost is four reads of a row that is already in
 * memory, and what it buys is that every downstream operation can rely on the ordering, the
 * attribution and the identity without re-deriving them.
 */
export function adminRevision(
  store: AdminRevisionStore,
  row: AdminResourceRecord,
  resource: string,
): AdminRevision {
  const recordId = required(row, store.record, store, "a record");
  const restoredFrom = store.restoredFrom === undefined ? null : row[store.restoredFrom];
  const happened =
    store.occurredAt === undefined
      ? ""
      : required(row, store.occurredAt, store, recordId);
  return {
    id: required(row, "id", store, recordId),
    resource,
    recordId,
    position: positionOf(row, store, recordId),
    cause: required(row, store.cause, store, recordId),
    restoredFrom: typeof restoredFrom === "string" && restoredFrom.length > 0 ? restoredFrom : null,
    occurredAt: happened,
    snapshot: store.read(row),
  };
}

/** Newest first, which is the order a person reads a history in and the order the position settles. */
export function byNewestRevision(left: AdminRevision, right: AdminRevision): number {
  return right.position - left.position;
}
