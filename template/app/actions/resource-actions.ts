"use server";

import type { AdminResourcePage, AdminResourceQuery } from "@yesvus/helmdeck";
import { resourceActions } from "@/lib/store";

/**
 * The persistence seam, answered over server actions, for the generated views.
 *
 * `AdminResourceList` and `AdminResourceForm` read from a browser effect, so the adapter they take
 * has to be constructible where they render. The database URL must never reach a browser bundle, so
 * it cannot. The interface is unchanged across the boundary, which is the point: the same list
 * cannot tell which store it is on, and only the server half ever holds a connection.
 *
 * Each call here refuses on the server before touching the store, and the refusal is the one rule.
 */
export async function queryResources<T>(
  resource: string,
  query?: Record<string, unknown>,
): Promise<T[]> {
  return resourceActions.query<T>(resource, query);
}

/**
 * The paged form, which is what makes a list draw a search box, sortable headers, filters, a pager
 * and a count: each of those sends a query here, and the store answers it.
 */
export async function queryResourcePage<T>(
  resource: string,
  query?: AdminResourceQuery,
): Promise<AdminResourcePage<T>> {
  const paged = resourceActions.queryPage;
  if (!paged) {
    throw new Error("The store cannot answer a paged query, so a generated list draws no controls");
  }
  return paged<T>(resource, query);
}

export async function readResource<T>(resource: string, id: string): Promise<T | null> {
  return resourceActions.read<T>(resource, id);
}

export async function createResource<T>(resource: string, value: unknown): Promise<T> {
  return resourceActions.create<T>(resource, value);
}

export async function updateResource<T>(resource: string, id: string, value: unknown): Promise<T> {
  return resourceActions.update<T>(resource, id, value);
}

export async function deleteResource(resource: string, id: string): Promise<void> {
  await resourceActions.delete(resource, id);
}
