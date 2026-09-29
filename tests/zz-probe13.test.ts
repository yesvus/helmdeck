// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

describe("probe 13", () => {
  it("checks CAST of a bound parameter", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];
    for (const [label, sql] of [
      ["literal cast", `SELECT CAST(5 AS TEXT) AS v`],
      ["bound cast", `SELECT CAST(? AS TEXT) AS v`],
      ["bound typeof", `SELECT typeof(?) AS v`],
      ["instr literal", `SELECT instr(lower(CAST(5 AS TEXT)), lower(CAST(5 AS TEXT))) AS v`],
      ["instr bound", `SELECT instr(lower(CAST(? AS TEXT)), lower(CAST(? AS TEXT))) AS v`],
    ]) {
      const result = await client.execute({ sql, args: sql.includes("?") ? [5, 5] : [] });
      lines.push(`${label.padEnd(16)} = ${String(result.rows[0]?.[0])}`);
    }

    await client.execute({ sql: `CREATE TABLE t (id TEXT, data TEXT)` });
    for (const [id, v] of [["a", 5], ["b", "5"], ["c", 5.5], ["d", 1e21], ["e", -3]]) {
      await client.execute({ sql: `INSERT INTO t VALUES (?, ?)`, args: [id, JSON.stringify({ v })] });
    }
    for (const [label, sql] of [
      ["haystack only", `SELECT id FROM t WHERE instr(lower(CAST(json_extract(data,'$."v"') AS TEXT)), '5') > 0`],
      ["both cast", `SELECT id FROM t WHERE instr(lower(CAST(json_extract(data,'$."v"') AS TEXT)), lower(CAST(? AS TEXT))) > 0`],
      ["both bound str", `SELECT id FROM t WHERE instr(lower(CAST(json_extract(data,'$."v"') AS TEXT)), lower(?)) > 0`],
    ]) {
      const result = await client.execute({ sql, args: sql.includes("?") ? ["5"] : [] });
      lines.push(`${label.padEnd(16)} = ${result.rows.map((r) => String(r[0])).join(",")}`);
    }

    writeFileSync("/tmp/opencode/probe13.txt", lines.join("\n"));
  });
});
