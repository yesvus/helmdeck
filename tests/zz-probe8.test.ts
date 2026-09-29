// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

const values = [
  1e15, 1e16, 1e17, 1e18, 1e19, 9.99e18, 1.23e18, 1e-3, 1e-4, 1.5e-4, 9.99e-5, 1e-5, 1.5e-5,
  1.5, 2.5, 0.125, 1 / 1024, 123.456, -0.0001, -1e-5, 1e100, -1e100, 1e-300,
  0.1, 0.2, 0.3, 123456789012345678, 1.2345678901234567,
];

describe("probe 8", () => {
  it("finds the boundary of the exponent switch", async () => {
    const client = createClient({ url: "file::memory:" });
    const result = await client.execute({
      sql: `SELECT CAST(value AS TEXT) AS cast, json_type(value) AS t FROM json_each(?)`,
      args: [`[${values.map((v) => JSON.stringify(v)).join(",")}]`],
    });
    const lines: string[] = ["js                        cast                    type"];
    for (const [index, row] of result.rows.entries()) {
      lines.push(`${String(values[index]).padEnd(25)} ${String(row[0]).padEnd(23)} ${row[1]}`);
    }
    writeFileSync("/tmp/opencode/probe8.txt", lines.join("\n"));
  });
});
