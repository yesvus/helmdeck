// SPDX-License-Identifier: MIT
import type { AdminSession } from "./session.js";
import type { AdminResourcePage, AdminResourceQuery } from "./query.js";

export type AdminPermission = string;

export type AdminPermissionsAdapter = {
  can: (permission: AdminPermission, context?: { resourceId?: string }) => Promise<boolean>;
};

export type AdminPersistenceAdapter = {
  read: <T>(resource: string, id: string) => Promise<T | null>;
  /**
   * Every matching record, and nothing else about the shape of the answer.
   *
   * The argument is left as it is deliberately. Every adapter written against this contract reads
   * it as a map of fields to exact values, and two failure modes pull in opposite directions: typing
   * it as a list query would stop compiling a call that works today in every host that has one,
   * and would read as valid a call that today silently matches nothing. `queryPage` is the
   * contract; this is the rows-only read, and it is what an adapter that has not opted into the
   * query answers.
   */
  query: <T>(resource: string, query?: Record<string, unknown>) => Promise<T[]>;
  /**
   * The rows a window asked for, and the number the same query matched before the window.
   *
   * Optional because it is the whole of the widening, and it is a widening: `query` returns rows
   * and nothing else, so an adapter that predates this contract satisfies `AdminPersistenceAdapter`
   * unchanged, and a list reading through one still renders every row it was given. An adapter that
   * implements this has said it understands search, sorting, filtering and paging, and its absence
   * is how a generated list knows not to offer controls that would do nothing.
   *
   * The host answers the window. A view never filters, orders or slices what it was handed.
   */
  queryPage?: <T>(resource: string, query?: AdminResourceQuery) => Promise<AdminResourcePage<T>>;
  create: <T>(resource: string, value: unknown) => Promise<T>;
  update: <T>(resource: string, id: string, value: unknown) => Promise<T>;
  delete: (resource: string, id: string) => Promise<void>;
};

export type AdminLocaleAdapter = {
  getInterfaceLocale: () => string | Promise<string>;
  getContentLocale: () => string | Promise<string>;
  setContentLocale?: (locale: string) => void | Promise<void>;
  /**
   * Maps a shell href onto the content locale. Hosts encode content locale in
   * their own URL shape, so the shell asks instead of assuming a parameter name.
   */
  toHref?: (href: string, contentLocale: string) => string;
};

export type AdminAuditEvent = {
  /** The operation that happened, which is the write's own vocabulary: create, update or delete. */
  action: string;
  resource: string;
  resourceId?: string;
  actor?: AdminSession;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Where a write is recorded.
 *
 * `createAdminResourceActions` is the only thing that calls this, once per write that reached the
 * store, and it calls it after the store answered: an event recorded before the effect is left behind
 * claiming a change that failed. A refused call records nothing, so what collects here is a trail of
 * what happened rather than a list of what was asked for.
 *
 * Recording is not the same as reading. The host's sink owns where these go and how they are read
 * back; the events carry the resource and the record, so the history of one record is a query rather
 * than a guess.
 */
export type AdminAuditAdapter = {
  record: (event: AdminAuditEvent) => Promise<void>;
};

export type AdminPreviewAdapter = {
  getUrl: (input: { resource: string; resourceId: string; locale?: string }) => string | Promise<string>;
};

/**
 * Where a write asks the host to drop what it cached.
 *
 * `createAdminResourceActions` calls this for the three write operations, after the audit record and
 * after the store answered. A create names the resource rather than the record, because a record no
 * read has returned yet has no key in the host's cache and what a create invalidates is the
 * collection it joined. A rejection here does not fail the write that already happened.
 */
export type AdminCacheInvalidationAdapter = {
  invalidate: (input: { resource: string; resourceId?: string; operation: "create" | "update" | "delete" }) => Promise<void>;
};

export type AdminHostAdapters = {
  permissions?: AdminPermissionsAdapter;
  persistence?: AdminPersistenceAdapter;
  locale?: AdminLocaleAdapter;
  audit?: AdminAuditAdapter;
  preview?: AdminPreviewAdapter;
  cache?: AdminCacheInvalidationAdapter;
};
