// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

describe("probe 14", () => {
  it("routes the needle through the stored spelling", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];
    await client.execute({ sql: `CREATE TABLE t (id TEXT, data TEXT)` });
    for (const [id, v] of [["a", 5], ["b", "5"], ["c", 5.5], ["d", 1e21], ["e", -3], ["f", 0.1 + 0.2], ["g", 1 / 3]]) {
      await client.execute({ sql: `INSERT INTO t VALUES (?, ?)`, args: [id, JSON.stringify({ v })] });
    }
    for (const needle of [5, 0, -3, 5.5, 1e21, 0.1 + 0.2, 1 / 3, 1e-7]) {
      const result = await client.execute({
        sql: `SELECT id FROM t WHERE instr(lower(CAST(json_extract(data,'$."v"') AS TEXT)), lower(CAST(json_extract(?, '$') AS TEXT))) > 0 ORDER BY id`,
        args: [JSON.stringify(needle)],
      });
      lines.push(
        `needle ${String(needle).padEnd(22)} json=${JSON.stringify(needle).padEnd(22)} -> ${result.rows.map((r) => String(r[0])).join(",")}`,
      );
    }
    writeFileSync("/tmp/opencode/probe14.txt", lines.join("\n"));
  });
});
