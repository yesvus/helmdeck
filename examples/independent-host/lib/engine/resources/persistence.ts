// SPDX-License-Identifier: MIT
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import type { AdminResourcePage, AdminResourceQuery } from "@yesvus/helmdeck";

export type AdminResourceActionHandlers = {
  query: (resource: string, query?: Record<string, unknown>) => Promise<unknown[]>;
  queryPage?: (
    resource: string,
    query?: AdminResourceQuery,
  ) => Promise<AdminResourcePage<unknown>>;
  read: (resource: string, id: string) => Promise<unknown | null>;
  create: (resource: string, value: unknown) => Promise<unknown>;
  update: (resource: string, id: string, value: unknown) => Promise<unknown>;
  delete: (resource: string, id: string) => Promise<void>;
};

export type AdminResourceReadOnlySource = Pick<AdminResourceActionHandlers, "query" | "queryPage" | "read">;

function readOnlyError(operation: "create" | "update" | "delete", resource: string): Error {
  return new Error(`${operation} is unavailable for read-only resource "${resource}"`);
}

export function createReadOnlyPersistenceAdapter(
  source: AdminResourceReadOnlySource,
): AdminPersistenceAdapter {
  const adapter: AdminPersistenceAdapter = {
    async query<T>(resource: string, query?: Record<string, unknown>) {
      return (await source.query(resource, query)) as T[];
    },
    async read<T>(resource: string, id: string) {
      return (await source.read(resource, id)) as T | null;
    },
    async create(resource: string) {
      throw readOnlyError("create", resource);
    },
    async update(resource: string) {
      throw readOnlyError("update", resource);
    },
    async delete(resource: string) {
      throw readOnlyError("delete", resource);
    },
  };

  if (source.queryPage !== undefined) {
    adapter.queryPage = async <T>(resource: string, query?: AdminResourceQuery) =>
      (await source.queryPage?.(resource, query)) as AdminResourcePage<T>;
  }

  return adapter;
}

export function createAdminResourceActionPersistenceAdapter(
  handlers: AdminResourceActionHandlers,
): AdminPersistenceAdapter {
  const adapter: AdminPersistenceAdapter = {
    async query<T>(resource: string, query?: Record<string, unknown>) {
      return (await handlers.query(resource, query)) as T[];
    },
    async read<T>(resource: string, id: string) {
      return (await handlers.read(resource, id)) as T | null;
    },
    async create<T>(resource: string, value: unknown) {
      return (await handlers.create(resource, value)) as T;
    },
    async update<T>(resource: string, id: string, value: unknown) {
      return (await handlers.update(resource, id, value)) as T;
    },
    async delete(resource: string, id: string) {
      await handlers.delete(resource, id);
    },
  };

  if (handlers.queryPage !== undefined) {
    adapter.queryPage = async <T>(resource: string, query?: AdminResourceQuery) =>
      (await handlers.queryPage?.(resource, query)) as AdminResourcePage<T>;
  }

  return adapter;
}
