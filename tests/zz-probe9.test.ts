// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

describe("probe 9", () => {
  it("looks for the stored number's own token", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];
    const document = JSON.stringify({ price: 0.1 + 0.2, count: 3, flag: true, name: "x" });
    lines.push(`document: ${document}`);

    for (const [label, sql] of [
      ["json_extract", `SELECT json_extract('${document}', '$.price')`],
      ["->>", `SELECT '${document}' ->> '$.price'`],
      ["->", `SELECT '${document}' -> '$.price'`],
      ["json_tree atom", `SELECT atom FROM json_tree('${document}') WHERE key = 'price'`],
      ["json_each value", `SELECT value FROM json_each('${document}') WHERE key = 'price'`],
      ["json_each atom", `SELECT atom FROM json_each('${document}') WHERE key = 'price'`],
      ["json_each type", `SELECT type FROM json_each('${document}') WHERE key = 'price'`],
      ["typeof extract", `SELECT typeof(json_extract('${document}', '$.price'))`],
    ]) {
      try {
        const result = await client.execute({ sql: `${sql} AS v` });
        lines.push(`  ${label.padEnd(18)} = ${String(result.rows[0]?.[0])}`);
      } catch (cause) {
        lines.push(`  ${label.padEnd(18)} ! ${(cause as Error).message.slice(0, 60)}`);
      }
    }

    const two = await client.execute({
      sql: `SELECT key, value, atom, type, id, parent FROM json_each(?) WHERE type = 'real'`,
      args: [document],
    });
    lines.push("");
    lines.push("json_each columns for a real:");
    for (const row of two.rows) lines.push(`  ${JSON.stringify(row)}`);

    writeFileSync("/tmp/opencode/probe9.txt", lines.join("\n"));
  });
});
