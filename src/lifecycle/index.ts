// SPDX-License-Identifier: MIT

/**
 * Content lifecycle over the host's own rows: what a record said before, a trash it can be put in,
 * and a way back from both.
 *
 * Three pieces, each of which the host declares and none of which the host has to build:
 *
 * - `createAdminLifecycle` decides and moves, over `AdminPersistenceAdapter`, so a trashed row is
 *   gone from every ordinary read by being absent rather than by being filtered out of one.
 * - `AdminRevisionStore` says where the history lives and how to read it, so a revision is a row in
 *   a table the host already has instead of a table this package would have to migrate into.
 * - `AdminResourceLifecycleOperation` is the vocabulary of the five new capabilities, kept beside
 *   `AdminResourceOperation` rather than inside it so that adding them is not a breaking change for a
 *   host that switches on the four it already has.
 */
export {
  AdminLifecycleChildError,
  AdminLifecycleError,
  AdminLifecycleNotDeclaredError,
  AdminLifecycleScopeError,
  AdminLifecycleStateError,
  AdminRevisionDriftError,
  AdminRevisionMalformedError,
  AdminRevisionUnknownError,
} from "./errors.js";
export type { AdminLifecycleRecordState, AdminLifecycleReferrer } from "./errors.js";
export { adminRevision, adminRevisionId, byNewestRevision, revisionIdOf } from "./revisions.js";
export type { AdminRevision, AdminRevisionStore, AdminRevisionWrite } from "./revisions.js";
export { createAdminLifecycle } from "./lifecycle.js";
export type {
  AdminChildDeclaration,
  AdminLifecycle,
  AdminLifecycleDeclaration,
  AdminLifecycleMove,
  AdminLifecycleScope,
  AdminResourceLifecycleOperation,
  AdminRevisionRecordOptions,
  AdminRevisionRestore,
  AdminRevisionRestoreOptions,
} from "./lifecycle.js";
