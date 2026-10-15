// SPDX-License-Identifier: MIT
"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { isAdminResourceField, parseAdminResourceQuery } from "./adapters/query.js";
import type { AdminPersistenceAdapter, AdminResourceQuery } from "./adapters/index.js";
import type { AdminScopeAdapter, AdminScopeFilter } from "./adapters/host.js";

type AdminRequestScope = {
  scope: string;
  toHref: (href: string) => string;
  resourceFilter: (resource: string) => AdminScopeFilter;
};

const AdminScopeContext = createContext<AdminRequestScope | null>(null);
const identityHref = (href: string) => href;

export function AdminScopeProvider({
  scope,
  adapter,
  children,
}: {
  scope: string;
  adapter: AdminScopeAdapter;
  children: ReactNode;
}) {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    throw new Error("AdminScopeProvider needs a non-empty scope");
  }

  const value = useMemo<AdminRequestScope>(
    () => ({
      scope,
      toHref: (href) => adapter.toHref(href, scope),
      resourceFilter: (resource) => {
        const filter = adapter.resourceFilter(resource, scope);
        if (!filter || !isAdminResourceField(filter.field) || typeof filter.value !== "string") {
          throw new Error(`The scope adapter returned an invalid filter for ${resource}`);
        }
        return filter;
      },
    }),
    [adapter, scope],
  );

  return <AdminScopeContext.Provider value={value}>{children}</AdminScopeContext.Provider>;
}

export function useAdminScopeHref() {
  return useContext(AdminScopeContext)?.toHref ?? identityHref;
}

export function useAdminScopeToken() {
  return useContext(AdminScopeContext);
}

export function useAdminScopedPersistence(persistence: AdminPersistenceAdapter) {
  const requestScope = useContext(AdminScopeContext);
  return useMemo(() => {
    if (!requestScope) return persistence;

    const withFilter = (resource: string, query: AdminResourceQuery = {}): AdminResourceQuery => {
      const filter = requestScope.resourceFilter(resource);
      const parsed = parseAdminResourceQuery(query);
      return {
        ...parsed,
        filter: [
          ...(parsed.filter ?? []).filter((entry) => entry.field !== filter.field),
          { field: filter.field, operator: "eq", value: filter.value },
        ],
      };
    };

    // Mutations stay behind host authorization because this client scope is caller-controlled.
    const scoped: AdminPersistenceAdapter = {
      // The host read action enforces per-record access; a client query cannot replace it.
      read: (resource, id) => persistence.read(resource, id),
      query: async (resource, query) => {
        const filter = requestScope.resourceFilter(resource);
        if (!persistence.queryPage && filter.field.includes(".")) {
          throw new Error(`Rows-only persistence cannot filter dotted scope field ${filter.field}; implement queryPage`);
        }
        return persistence.query(resource, { ...query, [filter.field]: filter.value });
      },
      create: (resource, value) => persistence.create(resource, value),
      update: (resource, id, value) => persistence.update(resource, id, value),
      delete: (resource, id) => persistence.delete(resource, id),
    };

    if (persistence.queryPage) {
      scoped.queryPage = <T,>(resource: string, query?: AdminResourceQuery) =>
        persistence.queryPage!<T>(resource, withFilter(resource, query));
    }

    if (persistence.insertIfAbsent) {
      scoped.insertIfAbsent = <T,>(resource: string, key: string, value: unknown) =>
        persistence.insertIfAbsent!<T>(resource, key, value);
    }

    return scoped;
  }, [persistence, requestScope]);
}
