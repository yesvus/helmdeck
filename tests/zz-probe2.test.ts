// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import type { AdminResourcePage, AdminResourceQuery } from "../src/adapters/index";

type Row = { id: string; [key: string]: unknown };

const records: Row[] = [
  { id: "e1", v: "ÉCOLE" },
  { id: "e2", v: "école" },
  { id: "e3", v: "STRASSE" },
  { id: "e4", v: "İstanbul" },
  { id: "e5", v: "ß" },
  { id: "e6", v: "TÜRK" },
  { id: "e7", v: "plain" },
  { id: "m1", meta: null, v: 1 },
  { id: "m2", meta: "scalar", v: 2 },
  { id: "m3", meta: { slug: "one" }, v: 3 },
  { id: "m4", meta: { slug: null }, v: 4 },
  { id: "m5", v: 5 },
  { id: "neg0", v: -0 },
  { id: "int64", v: 9007199254740993 },
  { id: "nested", v: { a: 1 } },
];

const queries: Array<[string, AdminResourceQuery | undefined]> = [
  ["search ÉCOLE", { search: "école" }],
  ["search école", { search: "école" }],
  ["contains ÉCOLE", { filter: [{ field: "v", operator: "contains", value: "ÉCOLE" }] }],
  ["contains école", { filter: [{ field: "v", operator: "contains", value: "école" }] }],
  ["contains Ü", { filter: [{ field: "v", operator: "contains", value: "Ü" }] }],
  ["contains ß", { filter: [{ field: "v", operator: "contains", value: "ß" }] }],
  ["search ß", { search: "ß" }],
  ["search plain", { search: "plain" }],
  ["contains 5 on int64", { filter: [{ field: "v", operator: "contains", value: "900719925474099" }] }],
  ["contains 3 on int64", { filter: [{ field: "v", operator: "contains", value: "992" }] }],
  ["nested path through a null", { filter: [{ field: "meta.slug", operator: "isNull" }] }],
  ["nested notNull through a scalar", { filter: [{ field: "meta.slug", operator: "notNull" }] }],
  ["nested eq through a null", { filter: [{ field: "meta.slug", operator: "eq", value: "one" }] }],
  ["nested ne through a null", { filter: [{ field: "meta.slug", operator: "ne", value: "one" }] }],
  ["nested contains", { filter: [{ field: "meta.slug", operator: "contains", value: "on" }] }],
  ["nested eq null literal", { filter: [{ field: "meta.slug", operator: "eq", value: null }] }],
  ["sort nested", { sort: [{ field: "meta.slug", direction: "asc" }] }],
  ["eq -0", { filter: [{ field: "v", operator: "eq", value: 0 }] }],
  ["gt -0", { filter: [{ field: "v", operator: "gt", value: 0 }] }],
  ["gte int64 literal", { filter: [{ field: "v", operator: "gte", value: 9007199254740992 }] }],
  ["eq int64 literal", { filter: [{ field: "v", operator: "eq", value: 9007199254740992 }] }],
  ["eq int64 odd", { filter: [{ field: "v", operator: "eq", value: 9007199254740993 }] }],
  ["sort v asc", { sort: [{ field: "v", direction: "asc" }] }],
  ["search over the id", { search: "neg0" }],
  ["contains 1 on a document", { filter: [{ field: "v", operator: "contains", value: "1" }] }],
  ["eq a on a document", { filter: [{ field: "v", operator: "eq", value: 1 }] }],
  ["gte a on a document", { filter: [{ field: "v", operator: "gte", value: "z" }] }],
  ["lt a on a document", { filter: [{ field: "v", operator: "lt", value: "z" }] }],
];

async function answer(
  store: ReturnType<typeof createMemoryPersistenceAdapter> | ReturnType<typeof createSqlitePersistenceAdapter>,
  query: AdminResourceQuery | undefined,
): Promise<string> {
  try {
    const page = (await store.queryPage<Row>("products", query)) as AdminResourcePage<Row>;
    return `${page.rows.map((row) => row.id).join(",")} | total=${page.total}`;
  } catch (cause) {
    return `THREW ${(cause as Error).message.slice(0, 60)}`;
  }
}

describe("probe 2", () => {
  it("prints every disagreement", async () => {
    const memory = createMemoryPersistenceAdapter();
    const sqlite = createSqlitePersistenceAdapter({ url: "file::memory:" });
    for (const record of records) {
      await memory.create("products", record);
      await sqlite.create("products", record);
    }
    const lines: string[] = [];
    for (const [label, query] of queries) {
      const fromMemory = await answer(memory, query);
      const fromSqlite = await answer(sqlite, query);
      const mark = fromMemory === fromSqlite ? "   " : ">>>";
      lines.push(`${mark} ${label.padEnd(28)} memory: ${fromMemory.padEnd(34)} sqlite: ${fromSqlite}`);
    }
    writeFileSync("/tmp/opencode/probe2.txt", lines.join("\n"));
  });
});
