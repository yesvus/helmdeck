// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

const numbers = [
  0, 1, -1, 5, 12345, 1e15, 1e16, 1e20, 1e21, 1e22, 0.5, 0.1, 5.5, 12345.6789,
  1e-4, 1e-5, 1e-6, 1e-7, 0.000001, 0.1 + 0.2, 1 / 3, 2 / 3,
  Number.MAX_SAFE_INTEGER, 1.7976931348623157e308, -1.5e-8, 1 / 7,
];

describe("probe 6", () => {
  it("looks for a rendering of a real that matches JavaScript", async () => {
    const client = createClient({ url: "file::memory:" });
    const lines: string[] = [];
    const result = await client.execute({
      sql: `SELECT json_quote(value) AS quoted,
                   json_quote(CAST(value AS TEXT)) AS quoted_cast,
                   substr(json_quote(value), 2, length(json_quote(value)) - 2) AS unquoted
            FROM json_each(?)`,
      args: [`[${numbers.map((n) => JSON.stringify(n)).join(",")}]`],
    });
    let quotedMatches = 0;
    let castMatches = 0;
    for (const [index, row] of result.rows.entries()) {
      const js = String(numbers[index]);
      const quoted = String(row[0]).replace(/^"|"$/g, "");
      const castQuoted = String(row[1]).replace(/^"|"$/g, "");
      if (quoted === js) quotedMatches += 1;
      if (castQuoted === js) castMatches += 1;
      if (quoted !== js || castQuoted !== js) {
        lines.push(`>>> js=${js.padEnd(22)} json_quote=${quoted.padEnd(22)} json_quote(cast)=${castQuoted}`);
      }
    }
    lines.push(`json_quote matches ${quotedMatches}/${numbers.length}, json_quote(cast) matches ${castMatches}/${numbers.length}`);

    // Whether the stored document's own token is reachable, which would be JavaScript's spelling
    // by construction rather than by formatting.
    const raw = await client.execute({
      sql: `SELECT json_type(data, '$.v') AS t,
                   json_extract(data, '$.v') AS v,
                   (SELECT member.value FROM json_each(data) AS member WHERE member.key = 'v') AS via_each
            FROM (SELECT json_object('v', 0.1 + 0.2) AS data)`,
    });
    lines.push("");
    lines.push(`raw token probe: ${JSON.stringify(raw.rows[0])}`);

    writeFileSync("/tmp/opencode/probe6.txt", lines.join("\n"));
  });
});
