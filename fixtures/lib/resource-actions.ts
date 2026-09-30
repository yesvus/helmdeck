// SPDX-License-Identifier: MIT
"use server";

import {
  createAdminResourceActions,
  type AdminPersistenceAdapter,
  type AdminResourcePage,
  type AdminResourceQuery,
} from "@yesvus/helmdeck";
import { adminResources } from "./admin-resources";
import { exposedResource } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
import { createDemoAuditAdapter, createDemoCacheAdapter } from "./demo-audit";
import { ensureDemoSeeded } from "./ensure-seeded";
import { requireDemoPermission } from "./demo-guard";

/**
 * The persistence seam, answered over a server action so a client component can read the database.
 *
 * `AdminResourceList` and `AdminResourceForm` take a `persistence` adapter and read through it from
 * an effect, which means the adapter has to be constructible where those components render. The
 * store's connection comes from environment variables that must never reach a browser bundle, so
 * the adapter cannot be built on the client. The interface is the same either side: the client calls
 * these, and these call the real adapter on the server.
 *
 * **A resource name arrives from the browser, so it is never trusted.** Anything here could be
 * invoked directly with any argument, by a signed-in visitor or by anyone who can post to the
 * action, which makes this the boundary where a resource name becomes a capability. The calls here
 * are the package's, built once over the guard the demo's rule is asked through, so every call
 * refuses on the server before touching the store and the exposed set is a closed set of names rather
 * than a check each action remembered to make. `users` and `sessions` are deliberately absent from
 * it, so password hashes and session rows are not reachable through a table browser that happens to
 * exist for products, and a name outside the set is refused before the session is resolved at all.
 *
 * What is left to the host is the write's shape: the fields a definition declares, filtered on the
 * server. The package decides who may write; the shape of what they may write is the host's.
 */

/**
 * The demo names every record itself, so a caller-supplied `id` is dropped.
 *
 * This was once a whole column whitelist, narrowing a write to the definition's declared fields
 * through `adminResourceValues`, because the package did not enforce that itself. It does now:
 * `createAdminResourceActions` refuses a write carrying a key its definition does not declare, and
 * does so before the store is reached. Keeping a second copy is what let the gap survive, because the
 * fixture was protected while the shipped boundary was not, so `tests/demo-write-shape.test.ts` was
 * asserting this function rather than the package.
 *
 * What is left is the one policy that is the demo's own rather than the package's. The package allows
 * a caller to name a record on a create, since a host may generate ids in the browser; this demo does
 * not, and a store that let a caller name a row could have it overwritten.
 */
function withoutCallerId(value: unknown): Record<string, unknown> {
  const incoming = (value ?? {}) as Record<string, unknown>;
  if (!("id" in incoming)) return incoming;
  const rest = { ...incoming };
  delete rest.id;
  return rest;
}

/** The demo's own store behind the package's calls. The reads are passed straight through. */
function demoNamedWrites(adapter: AdminPersistenceAdapter): AdminPersistenceAdapter {
  return {
    ...adapter,
    create: <T>(resource: string, value: unknown) =>
      adapter.create<T>(resource, withoutCallerId(value)),
  };
}

const store = createAdminResourceActions({
  guard: requireDemoPermission,
  persistence: demoNamedWrites(demoPersistence().adapter),
  expose: exposedResource,
  // After the refusal and before the effect, so the first request of a fresh process finds records
  // rather than an empty store, and a refused request does not pay for the seed.
  before: ensureDemoSeeded,
  // Read for the references the definitions declare and nothing else, which is what lets a write
  // carrying a value that names a row be refused before it reaches a table. Each of those references
  // is resolved through the same guard as any other read, so a column pointing at a resource this
  // session may not read offers no choices and refuses the writes naming one.
  definitions: adminResources,
  // Both halves of the seam the package now offers. The audit trail is not a resource a browser
  // browses, so it is written to its own table directly and never through these calls.
  audit: createDemoAuditAdapter(),
  cache: createDemoCacheAdapter(),
});

export async function queryResourceAction(
  resource: string,
  query?: Record<string, unknown>,
): Promise<unknown[]> {
  return store.query(resource, query);
}

/**
 * The paged form of the query, over the same guard and the same allowlist.
 *
 * A query arrives from the browser as a value a caller chose, so it goes to the store through the
 * package's parser, which is what refuses a part that is not part of a query. A caller who guesses
 * at a `limit` gets a refusal rather than the empty list the older form answers a guess with.
 *
 * The store decides whether this exists at all, and the browser is only told about it when it does.
 * Reaching here with a store that cannot page means the two halves of the demo disagree about what
 * the demo's store can do, which is worth saying rather than answering with rows.
 */
export async function queryPageAction(
  resource: string,
  query?: AdminResourceQuery,
): Promise<AdminResourcePage<unknown>> {
  const paged = store.queryPage;
  if (paged === undefined) {
    throw new Error(
      `The demo's ${demoPersistence().kind} store cannot answer a paged query for ${resource}`,
    );
  }
  return paged<unknown>(resource, query);
}

export async function readResourceAction(resource: string, id: string): Promise<unknown | null> {
  return store.read(resource, id);
}

export async function createResourceAction(resource: string, value: unknown): Promise<unknown> {
  return store.create(resource, value);
}

export async function updateResourceAction(
  resource: string,
  id: string,
  value: unknown,
): Promise<unknown> {
  return store.update(resource, id, value);
}

export async function deleteResourceAction(resource: string, id: string): Promise<void> {
  await store.delete(resource, id);
}
