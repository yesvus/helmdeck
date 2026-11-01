// SPDX-License-Identifier: MIT
// Set TEST_POSTGRES_URL to a disposable PostgreSQL URL to run the live connection check.
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { payloadDatabaseKind } from "../examples/payload-host/lib/payload/db";

describe("payload database URL selection", () => {
  it.each([
    [undefined, "sqlite"],
    ["file:./payload.db", "sqlite"],
    ["libsql://example.test", "sqlite"],
    ["postgres://user:pass@db.test/payload", "postgres"],
    ["postgresql://user:pass@db.test/payload", "postgres"],
  ] as const)("selects %s as %s", (url, kind) => {
    expect(payloadDatabaseKind(url)).toBe(kind);
  });
});

describe.skipIf(!process.env.TEST_POSTGRES_URL)("Payload PostgreSQL connection contract", () => {
  it("connects with the pg Pool connection-string contract", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    try {
      const result = await pool.query<{ value: number }>("select 1 as value");
      expect(result.rows[0]?.value).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
