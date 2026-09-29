// SPDX-License-Identifier: MIT
"use server";

import type { AdminPermission } from "../../src/adapters/index";
import { demoCan, exposedResource } from "./demo-rules";
import { demoPersistence } from "./demo-persistence";
import { ensureDemoSeeded } from "./ensure-seeded";
import { requireDemoSession } from "./demo-guard";

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
 * action, which makes this the boundary where a resource name becomes a capability. Three checks
 * run on every call rather than in the UI: a session, a fixed set of resources this admin exposes,
 * and the same permission rule the views render against. `users` and `sessions` are deliberately
 * absent, so password hashes and session rows are not reachable through a table browser that
 * happens to exist for products.
 *
 * What a session is allowed to do is decided by `demoCan`, which is also what decides whether the
 * buttons render. Enforcing it here rather than only there is the point: hiding a button is not
 * authorization, and a client that skips the UI can still post the action.
 */
function resourceOrRefuse(resource: string): string {
  if (!exposedResource(resource)) {
    throw new Error(`"${resource}" is not a resource this admin exposes`);
  }
  return resource;
}

type Operation = "read" | "create" | "update" | "delete";

async function withPermission(resource: string, operation: Operation) {
  const session = await requireDemoSession({ returnTo: "/shell" });
  const permission = `${resource}.${operation}` as AdminPermission;
  if (!demoCan(session, permission)) {
    throw new Error(`This session may not ${operation} ${resource}`);
  }
  // Checked before any read, so the first request of a fresh process finds records rather than an
  // empty store. Memoised inside, so this costs nothing after the first call.
  await ensureDemoSeeded();
  return session;
}

export async function queryResourceAction(
  resource: string,
  query?: Record<string, unknown>,
): Promise<unknown[]> {
  await withPermission(resourceOrRefuse(resource), "read");
  return demoPersistence().adapter.query(resource, query);
}

export async function readResourceAction(resource: string, id: string): Promise<unknown | null> {
  await withPermission(resourceOrRefuse(resource), "read");
  return demoPersistence().adapter.read(resource, id);
}

export async function createResourceAction(resource: string, value: unknown): Promise<unknown> {
  await withPermission(resourceOrRefuse(resource), "create");
  return demoPersistence().adapter.create(resource, value);
}

export async function updateResourceAction(
  resource: string,
  id: string,
  value: unknown,
): Promise<unknown> {
  await withPermission(resourceOrRefuse(resource), "update");
  return demoPersistence().adapter.update(resource, id, value);
}

export async function deleteResourceAction(resource: string, id: string): Promise<void> {
  await withPermission(resourceOrRefuse(resource), "delete");
  await demoPersistence().adapter.delete(resource, id);
}
