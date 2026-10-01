// SPDX-License-Identifier: MIT
/**
 * A tenant key, and the rules for refusing one that would not address a tenant.
 *
 * **Nothing here imports `node:async_hooks`, on purpose.** This module is reachable from
 * `@yesvus/helmdeck/baseline`, which a Next.js app imports on the client for its components, and
 * bundling `node:async_hooks` for the browser fails the build with "the chunking context does not
 * support external modules". The ambient scope therefore lives in `tenant-context.ts`, imported only
 * by the code that runs on a server.
 *
 * The rules are separate from the scope because they are needed by both: a Postgres store refuses a
 * missing tenant in a server process, and so does a host's own resolver, and neither needs a scope
 * to do it.
 */

/**
 * One tenant's key.
 *
 * A string, because that is what a `text` column holds and what a hostname, a subdomain or a row id
 * already is. A host that identifies tenants by uuid passes the uuid and the column is the one thing
 * that has to agree with it.
 */
export type AdminTenant = string;

/**
 * Raised when work needs a tenant and there is none, or when there is one but it is not usable.
 *
 * A distinct type so a host can catch it and send the operator to a login page, rather than letting
 * it surface as a database error on a query that happened to run without a tenant.
 */
export class AdminTenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminTenantError";
  }
}

/**
 * A tenant key this package will put in a statement.
 *
 * Checked here rather than at the store because a tenant key arrives from a hostname, a subdomain,
 * a session row or a header, and those are all places a value can be whatever a caller sent. An empty
 * or non-string tenant that reached a `WHERE tenant = ''` would select the rows of whichever tenant
 * genuinely has the empty key, which is a different failure from "no tenant".
 */
export function assertAdminTenant(value: unknown): AdminTenant {
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminTenantError(
      `A tenant must be a non-empty string, and this is ${JSON.stringify(value)}. An empty tenant is ` +
        "the one a query for \"no tenant\" matches, so it is refused rather than read as none.",
    );
  }
  if (value.length > 200) {
    throw new AdminTenantError(
      `A tenant key is at most 200 characters, and this one is ${value.length}. The column is text, ` +
        "and a key longer than a hostname, a uuid and a slug combined is not one.",
    );
  }
  return value;
}

/**
 * Where a store asks which tenant it is serving.
 *
 * A function rather than a value read once at startup, because a value read at startup is one value
 * for every request that follows. A resolver is asked per statement, and refusing when it returns
 * nothing is what keeps a query with no tenant from reading as "all of them".
 */
export type AdminTenantResolver = () => AdminTenant | undefined | Promise<AdminTenant | undefined>;

/**
 * Reads a resolver and refuses what it does not return.
 *
 * Split out so a host writing a resolver does not have to remember the two rules: the value is
 * checked rather than bound, and nothing at all is a refusal rather than a default.
 */
export async function resolveAdminTenant(
  resolver: AdminTenantResolver,
  what: string,
): Promise<AdminTenant> {
  const found = await resolver();
  if (found === undefined) {
    throw new AdminTenantError(
      `${what} needs a tenant and the resolver returned none. A resolver that cannot name the tenant ` +
        "is a store that would otherwise read or write every tenant's rows as one set.",
    );
  }
  return assertAdminTenant(found);
}

/**
 * The words a store uses when there is no tenant, so a host that writes its own resolver says the
 * same thing as this one.
 *
 * Named for the resolver rather than for a context, because a store cannot see an ambient scope on
 * its own: it asks a resolver, and the two ways a host supplies one are `currentAdminTenant` from the
 * `tenant-scope` entry point, or a header or session row read directly.
 */
export function missingTenantReason(what: string): string {
  return (
    `${what} needs a tenant and its resolver returned none. Give the store a resolver that names the ` +
    "tenant: currentAdminTenant from @yesvus/helmdeck/tenant-scope if the request is wrapped in " +
    "runWithAdminTenant, or one that reads a header or a session row. A store configured for tenancy " +
    'refuses an unscoped call rather than guessing, because every answer to "which rows does this ' +
    'mean" is a tenant\'s data reaching someone else.'
  );
}