// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

const points = (value: string): string => [...value].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

describe("probe 4", () => {
  it("prints the case-folding and search-over-number facts", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];

    const fold = await client.execute({
      sql: `SELECT lower('ÉCOLE') AS ecole, lower('école') AS ecole2, lower('İ') AS dotted,
                   lower('Ǆ') AS digraph, lower('ẞ') AS sharp, lower('ABC') AS abc,
                   instr(lower('ÉCOLE'), lower('école')) AS instr_unicode,
                   lower('É') = 'é' AS equal_unicode`,
    });
    lines.push("SQLite lower():");
    lines.push(`  lower('ÉCOLE') = ${points(String(fold.rows[0][0]))}`);
    lines.push(`  lower('école') = ${points(String(fold.rows[0][1]))}`);
    lines.push(`  lower('İ')     = ${points(String(fold.rows[0][2]))}`);
    lines.push(`  lower('Ǆ')     = ${points(String(fold.rows[0][3]))}`);
    lines.push(`  lower('ẞ')     = ${points(String(fold.rows[0][4]))}`);
    lines.push(`  lower('ABC')   = ${String(fold.rows[0][5])}`);
    lines.push(`  instr(lower('ÉCOLE'), lower('école')) = ${fold.rows[0][6]}`);
    lines.push(`  lower('É') = 'é' -> ${fold.rows[0][7]}`);
    lines.push("");
    lines.push("JavaScript toLowerCase():");
    for (const word of ["ÉCOLE", "école", "İ", "Ǆ", "ẞ", "ABC"]) {
      lines.push(`  ${word}.toLowerCase() = ${points(word.toLowerCase())}`);
    }

    const search = await client.execute({
      sql: `SELECT json_extract('{"a":0.30000000000000004}', '$.a') AS v,
                   CAST(json_extract('{"a":0.30000000000000004}', '$.a') AS TEXT) AS cast,
                   instr(lower(CAST(json_extract('{"a":0.30000000000000004}', '$.a') AS TEXT)), lower('0.30000000000000004')) AS finds_full,
                   instr(lower(CAST(json_extract('{"a":0.30000000000000004}', '$.a') AS TEXT)), lower('0.3')) AS finds_short`,
    });
    lines.push("");
    lines.push("search over a real:");
    lines.push(`  value=${String(search.rows[0][0])} cast=${String(search.rows[0][1])} finds full js spelling=${search.rows[0][2]} finds 0.3=${search.rows[0][3]}`);

    const ordered = await client.execute({
      sql: `SELECT value FROM json_each(?) ORDER BY value ASC`,
      args: [`["�","\u{10000}","\uFF00","\uD7FF"]`],
    });
    lines.push("");
    lines.push("ORDER BY over a text column, UTF-8 bytes:");
    lines.push(`  sqlite: ${ordered.rows.map((r) => points(String(r[0]))).join(" | ")}`);
    const words = ["�", "\u{10000}", "\uFF00", "\uD7FF"];
    lines.push(`  js    : ${[...words].sort().map((w) => points(w)).join(" | ")}`);

    writeFileSync("/tmp/opencode/probe4.txt", lines.join("\n"));
  });
});
