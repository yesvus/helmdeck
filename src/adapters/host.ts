// SPDX-License-Identifier: MIT
import type { AdminSession } from "./session.js";

export type AdminPermission = string;

export type AdminPermissionsAdapter = {
  can: (permission: AdminPermission, context?: { resourceId?: string }) => Promise<boolean>;
};

export type AdminPersistenceAdapter = {
  read: <T>(resource: string, id: string) => Promise<T | null>;
  query: <T>(resource: string, query?: Record<string, unknown>) => Promise<T[]>;
  create: <T>(resource: string, value: unknown) => Promise<T>;
  update: <T>(resource: string, id: string, value: unknown) => Promise<T>;
  delete: (resource: string, id: string) => Promise<void>;
};

export type AdminLocaleAdapter = {
  getInterfaceLocale: () => string | Promise<string>;
  getContentLocale: () => string | Promise<string>;
  setContentLocale?: (locale: string) => void | Promise<void>;
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
