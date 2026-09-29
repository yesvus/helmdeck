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
  const whole = (digits.slice(0, exponent + 1) || "0").padEnd(exponent + 1, "0");
  const rest = digits.slice(exponent + 1);
  // A real keeps a decimal point even when the rounding leaves nothing after it.
  const tail =
    exponent < 0
      ? `0.${"0".repeat(-exponent - 1)}${digits}`
      : rest.length > 0
        ? `.${rest}`
        : ".0";
  const body = exponent < 0 ? tail : `${whole}${tail}`;
  return value < 0 ? `-${body}` : body;
}

describe("probe 12", () => {
  it("fuzzes hard", async () => {
    const client = createClient({ url: "file::memory:" });
    const values: number[] = [];
    let seed = 20260930;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let index = 0; index < 12000; index += 1) {
      const magnitude = Math.floor(next() * 44) - 22;
      let value = next() * 10 ** magnitude;
      if (!Number.isFinite(value) || value === 0) continue;
      if (next() < 0.3) value = -value;
      if (next() < 0.25) value = Math.round(value);
      if (next() < 0.1) value = Number(value.toFixed(Math.floor(next() * 20)));
      if (!Number.isFinite(value) || Object.is(value, -0) || value === 0) continue;
      values.push(value);
    }
    for (const edge of [
      Number.MIN_VALUE, Number.MAX_VALUE, Number.EPSILON, 5e-324, 1e-323, 2 ** 53, 2 ** 53 + 2,
      -(2 ** 53) - 2, 1e15, 1e14, 9.999999999999999e14, 1e-4, 9.999999999999999e-5, 0.1 + 0.2, 1 / 3,
      1e-323, 4.9e-324, 1.7976931348623157e308, 123456789012345.6,
    ]) {
      if (Number.isFinite(edge) && !Object.is(edge, -0)) values.push(edge);
    }

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
          if (mismatches <= 20) lines.push(`>>> js=${batch[index]} cast=${String(row[0])} mine=${mine}`);
        }
      }
    }
    lines.unshift(`checked ${values.length} values, ${mismatches} mismatches`);
    writeFileSync("/tmp/opencode/probe12.txt", lines.join("\n"));
  }, 120000);
});
