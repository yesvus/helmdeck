import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createSqlitePersistenceAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminPersistenceAdapter, AdminResourceQuery } from "@yesvus/helmdeck";

const seedRecords: readonly [string, string, unknown][] = [
  ["workspace-profile", "workspace", { id: "workspace", name: "Sample editor" }],
  ["projects", "project_01", { id: "project_01", name: "Spring launch", status: "Active", owner: "Jordan Lee" }],
  ["projects", "project_02", { id: "project_02", name: "Customer portal", status: "Planning", owner: "Avery Chen" }],
  ["orders", "order_01", { id: "order_01", reference: "ORD-1042", customer: "Jordan Lee", status: "Paid" }],
  ["orders", "order_02", { id: "order_02", reference: "ORD-1043", customer: "Avery Chen", status: "Pending" }],
  ["content-blocks", "landing", [
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
];

const filename = resolve(process.env.INDEPENDENT_HOST_DATA_DB ?? ".next/independent-host-data.sqlite");
mkdirSync(dirname(filename), { recursive: true });
const store = createSqlitePersistenceAdapter({ url: filename });
let seeded: Promise<void> | undefined;

async function ensureSeeded(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    for (const [resource, id, value] of seedRecords) {
      if (await store.read(resource, id)) continue;
      try {
        await store.create(resource, value);
      } catch (cause) {
        if (await store.read(resource, id)) continue;
        throw cause;
      }
    }
  })().catch((cause: unknown) => {
    seeded = undefined;
    throw cause;
  });
  return seeded;
}

export const persistence: AdminPersistenceAdapter = {
  async read<T>(resource: string, id: string) {
    await ensureSeeded();
    return store.read<T>(resource, id);
  },
  async query<T>(resource: string, query?: Record<string, unknown>) {
    await ensureSeeded();
    return store.query<T>(resource, query);
  },
  async queryPage<T>(resource: string, query?: AdminResourceQuery) {
    await ensureSeeded();
    if (!store.queryPage) throw new Error("The SQLite adapter does not support paged queries");
    return store.queryPage<T>(resource, query);
  },
  async create<T>(resource: string, value: unknown) {
    await ensureSeeded();
    return store.create<T>(resource, value);
  },
  async update<T>(resource: string, id: string, value: unknown) {
    await ensureSeeded();
    return store.update<T>(resource, id, value);
  },
  async delete(resource: string, id: string) {
    await ensureSeeded();
    return store.delete(resource, id);
  },
};
