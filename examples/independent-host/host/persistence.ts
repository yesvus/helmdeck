import "server-only";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";

const records = new Map<string, unknown>([["workspace-profile:workspace", { name: "Sample editor" }]]);

export const persistence: AdminPersistenceAdapter = {
  async read<T>(resource: string, id: string) { return (records.get(`${resource}:${id}`) as T | undefined) ?? null; },
  async query<T>(resource: string) {
    const prefix = `${resource}:`;
    return [...records.entries()].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T);
  },
  async create<T>(resource: string, value: unknown) {
    const id = crypto.randomUUID();
    const record = { ...(typeof value === "object" && value !== null ? value : { value }), id };
    records.set(`${resource}:${id}`, record);
    return record as T;
  },
  async update<T>(resource: string, id: string, value: unknown) {
    records.set(`${resource}:${id}`, value);
    return value as T;
  },
  async delete(resource: string, id: string) { records.delete(`${resource}:${id}`); },
};
