// SPDX-License-Identifier: MIT
/**
 * The tenant in context, for a server.
 *
 * This is the module that imports `node:async_hooks`, and it is separate from `tenant-core.ts`
 * because `@yesvus/helmdeck/baseline` is reachable from a browser bundle and `async_hooks` is not.
 * A host's Next.js app imports the baseline subpath for its components; if that import reached this
 * file, the client build fails outright rather than degrading.
 *
 * **A tenant reaches a store as an ambient value rather than as an argument**, because the
 * persistence contract has no parameter to put it in and adding one would break every adapter a host
 * already wrote. The cost is that nothing forces a caller to say which tenant it means, so the rule
 * that matters is the other one: a store configured for tenancy **refuses** a call with no tenant in
 * context rather than defaulting to one.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AdminPersistenceAdapter, AdminResourceQuery } from "../adapters/index.js";
import {
  assertAdminTenant,
  missingTenantReason,
  resolveAdminTenant,
  AdminTenantError,
  type AdminTenant,
  type AdminTenantResolver,
} from "./tenant-core.js";

export {
  assertAdminTenant,
  missingTenantReason,
  resolveAdminTenant,
  AdminTenantError,
  type AdminTenant,
  type AdminTenantResolver,
};

interface TenantFrame {
  tenant: AdminTenant;
}

const storage = new AsyncLocalStorage<TenantFrame>();

/**
 * Runs work with a tenant in context, and hands back what it returned.
 *
 * **The scope crosses `await`**, which is the whole reason it is ambient rather than a parameter: a
 * store call three awaits deep has no tenant argument left to receive it, and a caller who had to
 * pass one down would eventually not.
 *
 * Nesting restores the outer tenant on the way out, so a request handling one tenant can run work for
 * another and get back to the first without it leaking into whatever runs next.
 */
export function runWithAdminTenant<T>(tenant: AdminTenant, work: () => T): Promise<T> {
  const key = assertAdminTenant(tenant);
  return storage.run({ tenant: key }, async () => await work());
}

/** The tenant in context, or nothing when there is none. Never throws, so a caller can branch. */
export function currentAdminTenant(): AdminTenant | undefined {
  return storage.getStore()?.tenant;
}

/** Whether a tenant is in context, for a caller deciding between a scoped and an unscoped path. */
export function hasAdminTenant(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * The tenant in context, or a refusal.
 *
 * This is what a store calls. A store that answers `undefined` has a choice to make about which rows
 * a query without a tenant means, and every answer to that question is a leak: the first tenant, all
 * of them, or the last one seen. Refusing is the only answer that is not one.
 */
export function requireAdminTenant(what: string): AdminTenant {
  const tenant = currentAdminTenant();
  if (tenant === undefined) {
    throw new AdminTenantError(missingTenantReason(what));
  }
  return tenant;
}

/**
 * A persistence adapter that refuses to run without a tenant, for a store this package does not
 * ship or does not know is scoped.
 *
 * **This does not scope rows.** It makes the tenant available in context and turns a missing one
 * into an error, and the store it wraps is still one store: wrapping the in-memory adapter here
 * would hand two tenants one set of rows with a scope around them that reads like isolation and is
 * not. Scoping is the store's own column, which is why `createPostgresPersistenceAdapter` takes a
 * tenant option rather than expecting a wrapper.
 *
 * What it is for is a host with its own adapter: the wrapper says which tenant each call belongs to
 * in one place, so twenty call sites do not each decide it, and the refusal is the same error the
 * shipped stores raise.
 */
export function createTenantScopedPersistenceAdapter(
  inner: AdminPersistenceAdapter,
  resolver?: AdminTenantResolver,
): AdminPersistenceAdapter {
  async function scoped<T>(what: string, call: () => Promise<T>): Promise<T> {
    // With no resolver the tenant comes from the context, and the refusal names this call rather
    // than the wrapper: an operator reading "a persistence call needs a tenant" learns nothing they
    // can act on, and twenty call sites all produce the same sentence.
    const tenant = resolver ? await resolveAdminTenant(resolver, what) : requireAdminTenant(what);
    return runWithAdminTenant(tenant, call);
  }

  return {
    read: <T>(resource: string, id: string) =>
      scoped(`Reading ${resource} ${id}`, () => inner.read<T>(resource, id)),
    query: <T>(resource: string, query?: Record<string, unknown>) =>
      scoped(`Querying ${resource}`, () => inner.query<T>(resource, query)),
    queryPage: inner.queryPage
      ? <T>(resource: string, query?: AdminResourceQuery) =>
          scoped(`Querying ${resource}`, () => inner.queryPage!<T>(resource, query))
      : undefined,
    create: <T>(resource: string, value: unknown) =>
      scoped(`Creating a ${resource}`, () => inner.create<T>(resource, value)),
    update: <T>(resource: string, id: string, value: unknown) =>
      scoped(`Updating ${resource} ${id}`, () => inner.update<T>(resource, id, value)),
    delete: (resource: string, id: string) =>
      scoped(`Deleting ${resource} ${id}`, () => inner.delete(resource, id)),
    insertIfAbsent: inner.insertIfAbsent
      ? <T>(resource: string, key: string, value: unknown) =>
          scoped(`Creating a ${resource}`, () => inner.insertIfAbsent!<T>(resource, key, value))
      : undefined,
  };
}