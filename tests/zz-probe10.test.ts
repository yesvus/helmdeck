// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

/** Candidate: %g with 15 significant digits, trailing zeros stripped, SQLite's exponent rule. */
function candidate(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) <= 9223372036854775807) return String(value);
  const exponential = Math.abs(value).toExponential(14);
  const [mantissa, exponentText] = exponential.split("e");
  const exponent = Number(exponentText);
  const digits = mantissa.replace(".", "").replace(/0+$/, "") || "0";
  if (exponent < -4 || exponent >= 15) {
    const fraction = mantissa.slice(mantissa.indexOf(".") + 1).replace(/0+$/, "") || "0";
    return `${value < 0 ? "-" : ""}${digits[0]}.${fraction}e${exponent < 0 ? "-" : "+"}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  const body =
    exponent >= 0
      ? digits.length > exponent + 1
        ? `${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`
        : digits + "0".repeat(exponent + 1 - digits.length)
      : `0.${"0".repeat(-exponent - 1)}${digits}`;
  return value < 0 ? `-${body}` : body;
}

const values = [
  0.5, 0.1, 5.5, 12345.6789, 0.1 + 0.2, 1 / 3, 2 / 3, 1 / 7, 1e-4, 1.5e-4, 9.99e-5, 1e-5, 1e-6,
  1e-7, 1.5e-8, 1e-300, 1e100, -1e100, 1.5, 0.125, 1 / 1024, 123.456, -0.0001, -1e-5, 1.2345678901234567,
  1.7976931348623157e308, Number.MIN_VALUE, 1e21, 1.5e21, 9.99e18, 1e-15, 6.02e23, 1.602e-19,
];

describe("probe 10", () => {
  it("tests the candidate against SQLite", async () => {
    const client = createClient({ url: "file::memory:" });
    const result = await client.execute({
      sql: `SELECT CAST(value AS TEXT) AS cast, json_type(value) AS t FROM json_each(?)`,
      args: [`[${values.map((v) => JSON.stringify(v)).join(",")}]`],
    });
    const lines: string[] = [];
    let matches = 0;
    for (const [index, row] of result.rows.entries()) {
      const mine = candidate(values[index]);
      const same = mine === String(row[0]);
      if (same) matches += 1;
      lines.push(`${same ? "   " : ">>>"} js=${String(values[index]).padEnd(24)} cast=${String(row[0]).padEnd(24)} mine=${mine}`);
    }
    lines.push(`matched ${matches}/${values.length}`);
    writeFileSync("/tmp/opencode/probe10.txt", lines.join("\n"));
  });
});
