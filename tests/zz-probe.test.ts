// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import type { AdminResourcePage, AdminResourceQuery } from "../src/adapters/index";

type Row = { id: string; [key: string]: unknown };

const records: Row[] = [
  { id: "text", v: "banana" },
  { id: "textNum", v: "5" },
  { id: "textEmpty", v: "" },
  { id: "textCaps", v: "Apple" },
  { id: "num5", v: 5 },
  { id: "num0", v: 0 },
  { id: "numNeg", v: -3 },
  { id: "numFrac", v: 5.5 },
  { id: "numBig", v: 1e21 },
  { id: "numSmall", v: 1e-7 },
  { id: "boolT", v: true },
  { id: "boolF", v: false },
  { id: "null", v: null },
  { id: "absent" },
  { id: "arr", v: [1, 2, 3] },
  { id: "obj", v: { slug: "one" } },
  { id: "strHigh", v: "�" },
  { id: "strSurrogate", v: "\u{10000}" },
];

const filterValues: Array<[string, unknown]> = [
  ["null", null],
  ["num 5", 5],
  ["num 0", 0],
  ["num -3", -3],
  ["num 5.5", 5.5],
  ["num 1e21", 1e21],
  ["num 1e-7", 1e-7],
  ["bool true", true],
  ["bool false", false],
  ["text banana", "banana"],
  ["text 5", "5"],
  ["text empty", ""],
];

const operators = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "isNull", "notNull"] as const;

const queries: Array<[string, AdminResourceQuery | undefined]> = [];
for (const operator of operators) {
  for (const [label, value] of filterValues) {
    queries.push([
      `${operator} ${label}`,
      { filter: [{ field: "v", operator, ...(value === undefined ? {} : { value: value as never }) }] },
    ]);
  }
}
queries.push(
  ["in [null]", { filter: [{ field: "v", operator: "in", value: [null] }] }],
  ["in [5, null]", { filter: [{ field: "v", operator: "in", value: [5, null] }] }],
  ["in [true, '5']", { filter: [{ field: "v", operator: "in", value: [true, "5"] }] }],
  ["in ['', null]", { filter: [{ field: "v", operator: "in", value: ["", null] }] }],
  ["in [5.5, 'banana']", { filter: [{ field: "v", operator: "in", value: [5.5, "banana"] }] }],
  ["search 5", { search: "5" }],
  ["search true", { search: "true" }],
  ["search null", { search: "null" }],
  ["search 1e+21", { search: "1e+21" }],
  ["search 1.0e+21", { search: "1.0e+21" }],
  ["search slug", { search: "slug" }],
  ["search one", { search: "one" }],
  ["search 5.5", { search: "5.5" }],
  ["search 1e-7", { search: "1e-7" }],
  ["search 1.0e-7", { search: "1.0e-7" }],
  ["search empty-ish", { search: "a" }],
  ["sort v asc", { sort: [{ field: "v", direction: "asc" }] }],
  ["sort v desc", { sort: [{ field: "v", direction: "desc" }] }],
  ["sort missing asc", { sort: [{ field: "nope", direction: "asc" }] }],
  ["nested eq one", { filter: [{ field: "meta.slug", operator: "eq", value: "one" }] }],
  ["nested gt z", { filter: [{ field: "meta.slug", operator: "gt", value: "z" }] }],
  ["through a scalar gte null", { filter: [{ field: "id", operator: "gte", value: null }] }],
  ["through a scalar gt 5", { filter: [{ field: "id", operator: "gt", value: 5 }] }],
  ["search term in a nested value", { search: "one" }],
  ["window over sort", { sort: [{ field: "v", direction: "asc" }], window: { offset: 3, limit: 5 } }],
);

async function answer(
  store: ReturnType<typeof createMemoryPersistenceAdapter> | ReturnType<typeof createSqlitePersistenceAdapter>,
  query: AdminResourceQuery | undefined,
): Promise<string> {
  try {
    const page = (await store.queryPage<Row>("products", query)) as AdminResourcePage<Row>;
    return `${page.rows.map((row) => row.id).join(",")} | total=${page.total}`;
  } catch (cause) {
    return `THREW ${(cause as Error).message.slice(0, 70)}`;
  }
}

describe("probe", () => {
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
      lines.push(
        `${mark} ${label.padEnd(28)} memory: ${fromMemory.padEnd(58)} sqlite: ${fromSqlite}`,
      );
    }
    writeFileSync("/tmp/opencode/probe.txt", lines.join("\n"));
  });
});
