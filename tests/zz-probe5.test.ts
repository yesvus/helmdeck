// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

const numbers = [
  0, 1, -1, 5, 12345, 1e15, 1e16, 1e20, 1e21, 1e22, 0.5, 0.1, 5.5, 12345.6789,
  1e-4, 1e-5, 1e-6, 1e-7, 1.5e-6, 0.000001, 123.456, 0.1 + 0.2, 1 / 3, 2 / 3,
  Number.MAX_SAFE_INTEGER, 1.7976931348623157e308, Number.MIN_VALUE, -1.5e-8,
];

describe("probe 5", () => {
  it("compares float spellings", async () => {
    const client = createClient({ url: "file::memory:" });
    const result = await client.execute({
      sql: `SELECT printf('%!.15g', value) AS g15,
                   printf('%.17g', value) AS g17,
                   CAST(value AS TEXT) AS cast
            FROM json_each(?)`,
      args: [`[${numbers.map((n) => JSON.stringify(n)).join(",")}]`],
    });
    const lines: string[] = ["number                js                 cast             g15               g17"];
    let g15Matches = 0;
    let g17Matches = 0;
    for (const [index, row] of result.rows.entries()) {
      const js = String(numbers[index]);
      const asG15 = String(row[1]) === js;
      const asG17 = String(row[2]) === js;
      if (asG15) g15Matches += 1;
      if (asG17) g17Matches += 1;
      lines.push(
        `${js.padEnd(20)} ${String(row[3]).padEnd(16)} ${String(row[1]).padEnd(16)} ${String(row[2]).padEnd(16)} ${asG15 ? "g15=" : ""}${asG17 ? "g17=" : ""}`,
      );
    }
    lines.push(`g15 matches ${g15Matches}/${numbers.length}, g17 matches ${g17Matches}/${numbers.length}`);
    writeFileSync("/tmp/opencode/probe5.txt", lines.join("\n"));
  });
});
