// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

describe("probe 3", () => {
  it("prints CAST and ordering facts", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];

    const numbers = [
      5, -3, 0, 0.5, 5.5, 1e-6, 1.5e-6, 1e-7, 1.25e-7, 1e21, 1.5e21, 1e-300, 1e300,
      0.1 + 0.2, 1 / 3, 1e-320, 9007199254740993, 1.7976931348623157e308, 12345.6789,
    ];
    const casted = await client.execute({
      sql: `SELECT CAST(value AS TEXT) AS as_text, printf('%!.15g', value) AS g15
            FROM json_each(?)`,
      args: [`[${numbers.map((n) => JSON.stringify(n)).join(",")}]`],
    });
    lines.push("CAST vs JavaScript String:");
    for (const [index, row] of casted.rows.entries()) {
      const js = String(numbers[index]);
      const sql = String(row[0]);
      lines.push(
        `${js === sql ? "   " : ">>>"} js=${js.padEnd(24)} cast=${sql.padEnd(24)} %!.15g=${row[1]}`,
      );
    }

    const words = ["�", "\u{10000}", "a", "ab"];
    const encoded = JSON.stringify(words);
    const ordering = await client.execute({
      sql: `SELECT x.value AS l, y.value AS r, (x.value < y.value) AS text_lt,
                   (CAST(x.value AS BLOB) < CAST(y.value AS BLOB)) AS blob_lt
            FROM json_each(?) x, json_each(?) y
            WHERE x.type = 'text' AND y.type = 'text'`,
      args: [encoded, encoded],
    });
    lines.push("");
    lines.push("text ordering, TEXT vs BLOB (js compares UTF-16):");
    for (const row of ordering.rows) {
      const left = String(row[0]);
      const right = String(row[1]);
      const js = left < right ? 1 : 0;
      const text = Number(row[2]);
      const blob = Number(row[3]);
      if (js !== text || js !== blob) {
        lines.push(
          `>>> js=${js} text=${text} blob=${blob}  ${JSON.stringify(left)} vs ${JSON.stringify(right)}`,
        );
      }
    }

    const misc = await client.execute({
      sql: `SELECT instr('abc', '') AS empty_needle,
                   instr(lower('ÉCOLE'), lower('école')) AS unicode_fold,
                   lower('ÉCOLE') AS lowered,
                   CAST(json_extract('{"a":{"slug":"one"}}', '$.a') AS TEXT) AS doc_text,
                   typeof(json_extract('{"a":{"slug":"one"}}', '$.a')) AS doc_type,
                   CAST(json_extract('{"a":1e+21}', '$.a') AS TEXT) AS big_text,
                   json_extract('{"a":1e+21}', '$.a') > ? AS big_gt,
                   CAST(json_extract('{"a":true}', '$.a') AS TEXT) AS bool_text`,
      args: [1e21],
    });
    lines.push("");
    lines.push("misc:");
    for (const [name, value] of [
      ["instr empty needle", misc.rows[0][0]],
      ["unicode fold", misc.rows[0][1]],
      ["lower ÉCOLE", misc.rows[0][2]],
      ["document cast", misc.rows[0][3]],
      ["document typeof", misc.rows[0][4]],
      ["1e21 cast", misc.rows[0][5]],
      ["1e21 > 1e21", misc.rows[0][6]],
      ["bool cast", misc.rows[0][7]],
    ]) {
      lines.push(`  ${name}: ${String(value)}`);
    }

    writeFileSync("/tmp/opencode/probe3.txt", lines.join("\n"));
  });
});
