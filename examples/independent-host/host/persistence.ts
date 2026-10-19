import "server-only";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";

const records = new Map<string, unknown>([
  ["workspace-profile:workspace", { name: "Sample editor" }],
  ["content-blocks:landing", [
    {
      id: "block_hero",
      kind: "hero",
      heading: "Make your workspace work better",
      headingByLocale: { en: "A better way to work", tr: "Daha iyi bir çalışma alanı" },
      copy: "Build your public page from typed content blocks.",
      imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&h=800&q=80",
      imageAlt: "A bright shared workspace",
    },
    {
      id: "block_quote",
      kind: "quote",
      heading: "From our customers",
      headingByLocale: { en: "From our customers", tr: "Müşterilerimizden" },
      copy: "The team made the move feel easy.",
      attribution: "Jordan Lee, customer",
    },
  ]],
]);

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
