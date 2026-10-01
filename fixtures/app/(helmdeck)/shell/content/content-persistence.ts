// SPDX-License-Identifier: MIT
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { CONTENT_RESOURCE } from "./content-status";
import {
  createContentPost,
  deleteContentPost,
  readContentPost,
  readContentPosts,
  updateContentPost,
} from "../../../../lib/demo-content";

/**
 * `AdminPersistenceAdapter` answered by the content actions, for the pages that render in a browser.
 *
 * The generated views name a resource on every call, so the name is checked rather than dropped. A
 * definition pointed at another table would otherwise be read and written through the post actions
 * while labelling every row with the wrong resource, which is the disagreement the demo's own rule
 * exists to prevent, arriving one layer further in.
 *
 * A constant rather than a factory, for the reason `clientPersistence` is one: the list and the form
 * both list `persistence` among the dependencies of the effect that loads their rows, so a fresh
 * object per render would reload on every render and never settle.
 */
function postsOnly(resource: string): void {
  if (resource !== CONTENT_RESOURCE) {
    throw new Error(`"${resource}" is not a resource the content pages can reach`);
  }
}

export const contentPersistence: AdminPersistenceAdapter = {
  async query<T>(resource: string): Promise<T[]> {
    postsOnly(resource);
    return (await readContentPosts()) as T[];
  },
  async read<T>(resource: string, id: string): Promise<T | null> {
    postsOnly(resource);
    return (await readContentPost(id)) as T | null;
  },
  async create<T>(resource: string, value: unknown): Promise<T> {
    postsOnly(resource);
    return (await createContentPost(value)) as T;
  },
  async update<T>(resource: string, id: string, value: unknown): Promise<T> {
    postsOnly(resource);
    return (await updateContentPost(id, value)) as T;
  },
  async delete(resource: string, id: string): Promise<void> {
    postsOnly(resource);
    await deleteContentPost(id);
  },
};
