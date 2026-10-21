"use client";

import { AdminResourceList, type AdminPersistenceAdapter } from "@yesvus/helmdeck";
import {
  createExampleResource,
  queryExampleResource,
  readExampleResource,
  updateExampleResource,
} from "@/host/actions";
import type { AdminResourceDefinition } from "@yesvus/helmdeck";

export const ExampleResourceListPersistence: AdminPersistenceAdapter = {
  read: async <T,>(resource: string, id: string): Promise<T | null> =>
    await readExampleResource(resource, id) as T | null,
  query: async <T,>(resource: string, query?: Record<string, unknown>): Promise<T[]> =>
    await queryExampleResource(resource, query) as T[],
  create: async <T,>(resource: string, value: unknown): Promise<T> =>
    await createExampleResource(resource, value) as T,
  update: async <T,>(resource: string, id: string, value: unknown): Promise<T> =>
    await updateExampleResource(resource, id, value) as T,
  delete: async () => { throw new Error("This example's generated resource lists are read-only."); },
};

export function ExampleResourceList({ definition }: { definition: AdminResourceDefinition }) {
  return <AdminResourceList
    definition={definition}
    persistence={ExampleResourceListPersistence}
    detailBaseHref={definition.path}
  />;
}
