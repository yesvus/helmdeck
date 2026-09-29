// SPDX-License-Identifier: MIT
// TEMPORARY PROBE. Deleted before commit.
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createClient } from "@libsql/client";

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
  return value < 0 ? `-${body}` : body;}

describe("probe 11", () => {
  it("fuzzes the candidate against thousands of reals", async () => {
    const client = createClient({ url: "file::memory:" });
    const values: number[] = [];
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let index = 0; index < 4000; index += 1) {
      const roll = next();
      const magnitude = Math.floor(next() * 40) - 20;
      const mantissa = next() * 10 ** (Math.floor(next() * 8) + 1);
      let value = roll < 0.5 ? mantissa * 10 ** magnitude : Math.floor(next() * 1e18) - 5e17;
      if (!Number.isFinite(value)) continue;
      if (next() < 0.3) value = -value;
      if (next() < 0.2) value = Math.round(value);
      if (!Number.isFinite(value) || Object.is(value, -0)) continue;
      values.push(value);
    }
    values.push(Number.MIN_VALUE, Number.MAX_VALUE, 5e-324, 1e-323, Number.EPSILON, 2 ** 53, -(2 ** 53) - 1);

    const lines: string[] = [];
    let mismatches = 0;
    for (let start = 0; start < values.length; start += 200) {
      const batch = values.slice(start, start + 200);
      const result = await client.execute({
        sql: `SELECT CAST(value AS TEXT) AS cast FROM json_each(?)`,
        args: [`[${batch.map((v) => JSON.stringify(v)).join(",")}]`],
      });
      for (const [index, row] of result.rows.entries()) {
        const mine = candidate(batch[index]);
        if (mine !== String(row[0])) {
          mismatches += 1;
          if (mismatches <= 25) {
            lines.push(`>>> js=${batch[index]} cast=${String(row[0])} mine=${mine}`);
          }
        }
      }
    }
    lines.unshift(`checked ${values.length} values, ${mismatches} mismatches`);
    writeFileSync("/tmp/opencode/probe11.txt", lines.join("\n"));
  }, 60000);
});
