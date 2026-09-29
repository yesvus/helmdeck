// SPDX-License-Identifier: MIT
"use server";

import {
  adminResourceValues,
  createAdminResourceActions,
  type AdminPersistenceAdapter,
} from "@yesvus/helmdeck";
import { adminResources } from "./admin-resources";
import { exposedResource } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
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
 * action, which makes this the boundary where a resource name becomes a capability. So the five
 * calls are the package's, built once here over the guard the permission rule is asked through:
 * every call refuses on the server before touching the store, so a denial is a refusal of the
 * request rather than a button that was never drawn. `users` and `sessions` are deliberately
 * absent from the exposed set, so password hashes and session rows are not reachable through a table
 * browser that happens to exist for products, and the name is refused before the session is even
 * resolved, because a name outside the set is not a permission question.
 *
 * The session behind the guard is resolved from the cookie's signed session id and the role on the
 * user row that id points at, so nothing here can be talked into a different role.
 */

/**
 * Whether a resource has column definitions to filter a write against.
 *
 * Not every exposed resource is a table browser's: `site_settings` is a single settings row written
 * by the site's own module, and it declares no columns anywhere. Filtering an undeclared resource
 * would refuse it, which is why this is a question about the resource rather than a rule applied to
 * all of them. Such a resource is still behind the same session, the same allowlist and the same
 * permission rule; what it is not behind is a list of fields, because it never had one.
 */
function isFormDefined(resource: string): boolean {
  return adminResources.some((candidate) => candidate.resource === resource);
}

/**
 * The declared fields of a record, and nothing else, read on the server.
 *
 * `adminResourceValues` is what the generated forms call in the browser, and it reads only the fields
 * a definition declares. Calling it here means the two halves cannot disagree about a record's
 * shape: the same function that decides what a form sends decides what a write stores.
 *
 * Without this, the README's claim that a field removed from the definition cannot be smuggled back
 * in through a hand-edited request was true only of the form and false of the boundary, because the
 * action handed its `value` straight to the adapter. The column check in the persistence layer is
 * not a substitute: it asks whether a name is a column of the table, and `id`, `created_at` and
 * `updated_at` all are, so a request could have set them and the write would have succeeded.
 */
function declaredValue(resource: string, value: unknown): Record<string, unknown> {
  if (!isFormDefined(resource)) return (value ?? {}) as Record<string, unknown>;

  const definition = adminResources.find((candidate) => candidate.resource === resource)!;
  const incoming = (value ?? {}) as Record<string, unknown>;
  const form = new FormData();
  for (const [key, entry] of Object.entries(incoming)) {
    form.append(key, entry === null || entry === undefined ? "" : String(entry));
  }
  return adminResourceValues(definition, form);
}

/**
 * The demo's own store behind the package's calls, so the filtering of a write happens at the
 * boundary the browser cannot reach. The reads are passed straight through.
 */
function declaredWrites(adapter: AdminPersistenceAdapter): AdminPersistenceAdapter {
  return {
    ...adapter,
    create: (resource, value) => adapter.create(resource, declaredValue(resource, value)),
    update: (resource, id, value) => adapter.update(resource, id, declaredValue(resource, value)),
  } as AdminPersistenceAdapter;
}

const store = createAdminResourceActions({
  guard: requireDemoPermission,
  persistence: declaredWrites(demoPersistence().adapter),
  expose: exposedResource,
  // After the refusal and before the effect, so the first request of a fresh process finds records
  // rather than an empty store, and a refused request does not pay for the seed.
  before: ensureDemoSeeded,
});

export async function queryResourceAction(
  resource: string,
  query?: Record<string, unknown>,
): Promise<unknown[]> {
  return store.query(resource, query);
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
