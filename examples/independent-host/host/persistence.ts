import "server-only";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";

type Profile = { name: string };
const records = new Map<string, Profile>([["workspace", { name: "Sample editor" }]]);

export const persistence: AdminPersistenceAdapter = {
  async read<T>(_resource: string, id: string) { return (records.get(id) as T | undefined) ?? null; },
  async query<T>() { return [...records.values()] as T[]; },
  async create<T>(_resource: string, value: unknown) { records.set("workspace", value as Profile); return value as T; },
  async update<T>(_resource: string, id: string, value: unknown) { records.set(id, value as Profile); return value as T; },
  async delete(_resource: string, id: string) { records.delete(id); },
};
