// SPDX-License-Identifier: MIT
import type { AdminResourceRecord } from "../resources/registry.js";

/** One refusal this layer makes, so a host can tell them apart with one `instanceof`. */
export class AdminLifecycleError extends Error {
  readonly resource: string;
  readonly id: string | undefined;

  constructor(message: string, resource: string, id?: string) {
    super(message);
    this.name = "AdminLifecycleError";
    this.resource = resource;
    this.id = id;
  }
}

/**
 * Refused because the resource was never declared to this layer.
 *
 * A distinct refusal from `AdminResourceNotExposedError` because it is a wiring fault rather than a
 * decision: an exposed resource with no trash table and no revision store declared has no lifecycle
 * to run, and reporting that as "not exposed" would point a host at its exposure list instead of at
 * the declaration it forgot.
 */
export class AdminLifecycleNotDeclaredError extends AdminLifecycleError {
  /** Which half of the declaration was missing, so the message points at the right line. */
  readonly missing: "trash" | "revisions";

  constructor(resource: string, missing: "trash" | "revisions" = "trash") {
    super(
      missing === "revisions"
        ? `"${resource}" declares no revision store, so its records have no history and nothing can be ` +
          "restored from one. Declare the columns its revision table uses."
        : `No lifecycle is declared for "${resource}", so it has no trash. Declare it, with the table ` +
          "its deleted rows move into.",
      resource,
    );
    this.name = "AdminLifecycleNotDeclaredError";
    this.missing = missing;
  }
}

/**
 * The state a record is in, and so the state the operation needed it not to be in.
 *
 * `live` and `trashed` are one question with two answers, which is why this is one error with a
 * field rather than two classes: a caller asks "may I trash this row" or "may I restore it" and the
 * answer to both is "it is already in the state you are asking me to move it out of". A restore that
 * reported success on a row that was never deleted is the failure this exists to prevent, and it can
 * only be prevented by refusing on the state rather than on the work.
 */
export type AdminLifecycleRecordState = "live" | "trashed" | "missing" | "both";

export class AdminLifecycleStateError extends AdminLifecycleError {
  readonly state: AdminLifecycleRecordState;
  /** Where the trash is, when the host declared one. Null for a resource that has no trash. */
  readonly trash: string | null;

  constructor(input: {
    resource: string;
    id: string;
    trash: string | null;
    state: AdminLifecycleRecordState;
    operation: string;
  }) {
    super(
      input.state === "missing"
        ? `No ${input.resource} record with id ${input.id}, so it cannot be ${input.operation}.`
        : input.state === "both"
          ? `A record with id ${input.id} is in both ${input.resource} and ${input.trash}, which is the ` +
            `state a ${input.operation} cannot resolve. The copy in ${input.trash} is the one to remove.`
          : `A ${input.resource} record with id ${input.id} is already ${input.state}, so it cannot be ` +
            `${input.operation}.`,
      input.resource,
      input.id,
    );
    this.name = "AdminLifecycleStateError";
    this.state = input.state;
    this.trash = input.trash;
  }
}

/** One row that points at the record a trash or a purge would take away. */
export type AdminLifecycleReferrer = {
  resource: string;
  field: string;
  rows: AdminResourceRecord[];
};

/**
 * Refused because live rows point at the record being taken away, and nothing declared what happens
 * to them.
 *
 * A reference left pointing at nothing is not a cosmetic problem: the reference checker on the write
 * boundary refuses a *new* dangling value, so a trash that orphans rows makes those rows
 * uneditable by anyone afterwards. Refusing and naming the rows is the direction that leaves the host
 * to decide, which is the only thing here that is genuinely its call: what a comment means without
 * the post it is on is a domain question, and this layer has no opinion about content.
 */
export class AdminLifecycleChildError extends AdminLifecycleError {
  readonly referrers: AdminLifecycleReferrer[];

  constructor(resource: string, id: string, referrers: AdminLifecycleReferrer[]) {
    const named = referrers
      .map((one) => `${one.rows.length} ${one.resource} row(s) through ${one.field}`)
      .join(", ");
    super(
      `${resource} ${id} cannot be trashed while ${named} point at it. Declare those references with ` +
        `on: "trash" to bring them along, or on: "keep" to state that losing the target is intended.`,
      resource,
      id,
    );
    this.name = "AdminLifecycleChildError";
    this.referrers = referrers;
  }
}

/**
 * Refused because the revision holds fields the record no longer has.
 *
 * The shape of the problem is a column dropped between the revision and the restore. A snapshot of
 * the whole row cannot bring a column back, and writing it would either fail or quietly discard a
 * value, so the choice a restore has to make is which of those two it is. Refusing names the fields
 * and lets the caller opt in per field, because a caller that says "yes, lose `legacy_score`" has
 * decided something only they can decide.
 */
export class AdminRevisionDriftError extends AdminLifecycleError {
  readonly revision: string;
  readonly fields: string[];

  constructor(input: { resource: string; id: string; revision: string; fields: string[] }) {
    super(
      `Revision ${input.revision} holds ${input.fields.join(", ")}, which ${input.resource} ${input.id} ` +
        "no longer has. A restore cannot bring a dropped column back. Pass the fields you accept " +
        "losing in dropFields, or restore a revision taken after the column was dropped.",
      input.resource,
      input.id,
    );
    this.name = "AdminRevisionDriftError";
    this.revision = input.revision;
    this.fields = input.fields;
  }
}

/**
 * Refused because a revision row cannot be read as a revision.
 *
 * A row with no position in it cannot be ordered, and a history that cannot say which of two changes
 * came first is not a history. A row with no cause cannot be told from an edit, which is the one
 * thing a history is for. Both are a store whose shape does not match the declaration naming its
 * columns, so the refusal names the column rather than the value.
 */
export class AdminRevisionMalformedError extends AdminLifecycleError {
  readonly column: string;

  constructor(input: { revisions: string; record: string; column: string; detail: string }) {
    super(
      `A ${input.revisions} row for ${input.record} cannot be read: ${input.column} ${input.detail}. The ` +
        "declaration for that store names this column.",
      input.revisions,
      input.record,
    );
    this.name = "AdminRevisionMalformedError";
    this.column = input.column;
  }
}

/**
 * Refused because the named revision is not one of this record's revisions.
 *
 * A revision is read through the record it describes, so an id is not a capability on its own: taken
 * alone it would put one record's content onto another's. The lookup is over the history of the
 * record named by the call, which is why an id belonging to another record finds nothing here even
 * when its content is exactly what the caller wanted.
 */
export class AdminRevisionUnknownError extends AdminLifecycleError {
  readonly revision: string;

  constructor(input: { resource: string; id: string; revision: string }) {
    super(
      `No revision ${input.revision} belongs to ${input.resource} ${input.id}, so there is nothing to ` +
        "restore from it.",
      input.resource,
      input.id,
    );
    this.name = "AdminRevisionUnknownError";
    this.revision = input.revision;
  }
}

/**
 * Refused because a trash scope was asked something it is not.
 *
 * Its own class because it is a wiring fault at the call site rather than a decision about a record:
 * a list mounted on a trash was driven with another resource's name, or with a control that writes.
 * The message says which, since the caller reading it is the host wiring the list.
 */
export class AdminLifecycleScopeError extends AdminLifecycleError {
  readonly trash: string;

  constructor(input: { resource: string; id?: string; trash: string; asked: string; operation: string }) {
    super(
      input.asked === input.trash
        ? `A row in ${input.trash} cannot be ${input.operation}, because a trashed row is not a live ` +
          `${input.resource}. Untrash it first.`
        : `${input.trash} answers for ${input.trash} alone, and was asked for ${input.asked} to ${input.operation}.`,
      input.resource,
      input.id,
    );
    this.name = "AdminLifecycleScopeError";
    this.trash = input.trash;
  }
}
