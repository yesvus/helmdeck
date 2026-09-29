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
  action: string;
  resource: string;
  resourceId?: string;
  actor?: AdminSession;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export type AdminAuditAdapter = {
  record: (event: AdminAuditEvent) => Promise<void>;
};

export type AdminPreviewAdapter = {
  getUrl: (input: { resource: string; resourceId: string; locale?: string }) => string | Promise<string>;
};

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
