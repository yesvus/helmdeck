// SPDX-License-Identifier: MIT
import type { AdminPersistenceAdapter } from "../../src/adapters/host";
import {
  createResourceAction,
  deleteResourceAction,
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
 * It is a constant rather than a factory. Both generated views list `persistence` among the
 * dependencies of the effect that loads their rows, so a fresh object per render would reload on
 * every render and the list would never settle.
 */
export const clientPersistence: AdminPersistenceAdapter = {
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
