// SPDX-License-Identifier: MIT
import type {
  AdminPersistenceAdapter,
  AdminResourcePage,
  AdminResourceQuery,
} from "@yesvus/helmdeck";
import {
  createResourceAction,
  deleteResourceAction,
  queryPageAction,
  queryResourceAction,
  readResourceAction,
  updateResourceAction,
} from "./resource-actions";

/**
 * `AdminPersistenceAdapter` answered over server actions, for components that render in the
 * browser.
 *
 * The interface is unchanged, which is the point of the seam: the same `AdminResourceList` reads
 * through the server-side adapter and through this one, and cannot tell which. What differs is
 * where the work happens, and only the server half ever holds a connection string.
 *
 * These are constants rather than factories. Both generated views list `persistence` among the
 * dependencies of the effect that loads their rows, so a fresh object per render would reload on
 * every render and the list would never settle.
 *
 * Two of them, and the difference is the whole compatibility story. `queryPage` is present only on
 * the one the store behind it can answer, which is how a generated list decides to draw a search
 * box, sortable headers, filter controls and a pager at all. The demo runs on the in-memory adapter,
 * which pages, and on the Turso adapter, which does not, so the shape of this object is the shape of
 * the demo's store rather than a constant the demo would have to remember to keep in step with it.
 */
const calls = {
  async query<T>(resource: string, query?: Record<string, unknown>): Promise<T[]> {
    return (await queryResourceAction(resource, query)) as T[];
  },
  async read<T>(resource: string, id: string): Promise<T | null> {
    return (await readResourceAction(resource, id)) as T | null;
  },
  async create<T>(resource: string, value: unknown): Promise<T> {
    return (await createResourceAction(resource, value)) as T;
  },
  async update<T>(resource: string, id: string, value: unknown): Promise<T> {
    return (await updateResourceAction(resource, id, value)) as T;
  },
  async delete(resource: string, id: string): Promise<void> {
    await deleteResourceAction(resource, id);
  },
};

/** For a form, and for a list whose store cannot page. */
export const clientPersistence: AdminPersistenceAdapter = calls;

/** For a list whose store can page, and so can answer a search, an ordering and a window. */
export const pagedClientPersistence: AdminPersistenceAdapter = {
  ...calls,
  async queryPage<T>(resource: string, query?: AdminResourceQuery): Promise<AdminResourcePage<T>> {
    return (await queryPageAction(resource, query)) as AdminResourcePage<T>;
  },
};
