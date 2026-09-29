// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

const values = [
  0.5, 0.1, 5.5, 12345.6789, 0.30000000000000004, 1 / 3, 2 / 3, 1 / 7,
  1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1.5e-5, 1e-6, 1e-7, 1.5e-8,
  1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1.5e21,
  999999999999999, 1234567890123456, 12345678901234567,
];

describe("probe 7", () => {
  it("maps CAST(real AS TEXT) exactly", async () => {
    const client = createClient({ url: "file::memory:" });
    const result = await client.execute({
      sql: `SELECT CAST(value AS TEXT) AS cast FROM json_each(?)`,
      args: [`[${values.map((v) => JSON.stringify(v)).join(",")}]`],
    });
    const lines: string[] = ["js                       cast"];
    for (const [index, row] of result.rows.entries()) {
      lines.push(`${String(values[index]).padEnd(24)} ${String(row[0])}`);
    }
    writeFileSync("/tmp/opencode/probe7.txt", lines.join("\n"));
  });
});
