// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { migrateDemo } from "../fixtures/lib/migrate";
import {
  createTursoPersistenceAdapter,
  resetTursoAdapterCache,
  type SqlClient,
} from "../fixtures/lib/turso-persistence";
import { adminAnalyticsRead, adminAnalyticsRecord, adminAnalyticsRetain, adminAnalyticsSeries } from "../src/analytics";
import { adminChartDayRange } from "../src/charts";
import type { AdminAnalyticsEventRow } from "../src/analytics";

/**
 * The capture layer against the demo's own database, through the real migration runner.
 *
 * The allowlist in `turso-persistence.ts` and the table in `0010_analytics_events.sql` are two halves
 * of one change, and nothing short of this test can tell when they have drifted. A branch with the
 * migration and not the allowlist entry passes every other test in this repository, because the
 * shipped stores are not the demo's, and then fails on the first write against Turso with a message
 * about a table this demo does not store. The columns are checked the same way: a row whose field is
 * not a column of the table is refused by the adapter, which is a refusal here and a green run
 * everywhere else.
 *
 * No live database is touched. Every case gets its own file in a temporary directory, created and
 * migrated in the test.
 */

const MIGRATIONS = join(process.cwd(), "fixtures", "lib", "migrations");

const NOW = new Date("2026-09-30T12:00:00.000Z");
const CLOCK = () => NOW;
const RANGE = adminChartDayRange(4, NOW);

let scratch = 0;

/** A migrated database of its own, so nothing here can reach another case's rows. */
function migrated() {
  const dir = mkdtempSync(join(tmpdir(), `helmdeck-analytics-${scratch++}-`));
  const client: Client = createClient({ url: `file:${join(dir, "db.sqlite")}` });
  const sql = client as unknown as SqlClient;
  return { client, sql, adapter: createTursoPersistenceAdapter(sql) };
}

describe("the demo's own store holds captured events", () => {
  it("applies the migration that creates the table", async () => {
    const { client, sql } = migrated();
    const result = await migrateDemo(sql, MIGRATIONS);
    expect(result.applied.length).toBeGreaterThan(0);

    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'",
    );
    expect(tables.rows).toHaveLength(1);
  });

  it("writes a row whose every field is a column of that table", async () => {
    const { sql, adapter } = migrated();
    await migrateDemo(sql, MIGRATIONS);
    resetTursoAdapterCache();

    const written = await adminAnalyticsRecord(adapter, {
      kind: "page_view",
      path: "/pricing",
      visitorKey: "v-1",
      source: "newsletter",
    }, { now: CLOCK });

    // The adapter checks every supplied field against the schema, so a row naming a column the
    // migration did not create is refused here rather than on the demo's database.
    expect(written).toMatchObject({
      kind: "page_view",
      path: "/pricing",
      visitor_key: "v-1",
      source: "newsletter",
      occurred_at: "2026-09-30T12:00:00.000Z",
    });

    const columns = await sql.execute({ sql: "PRAGMA table_info(analytics_events)" });
    expect(columns.rows.map((row) => String(row[1])).sort()).toEqual([
      "id",
      "kind",
      "occurred_at",
      "path",
      "source",
      "visitor_key",
    ]);
  });

  it("counts what it wrote, on a store with no paged query", async () => {
    const { sql, adapter } = migrated();
    await migrateDemo(sql, MIGRATIONS);
    resetTursoAdapterCache();

    // The demo's adapter is a rows-only one, so a range read is made over the whole resource and
    // narrowed here. That is the cost of not having opted into `queryPage`, and it is the reason the
    // read refuses above its cap rather than truncating.
    expect("queryPage" in adapter).toBe(false);

    for (const [day, key] of [["2026-09-28", "v-1"], ["2026-09-28", "v-1"], ["2026-09-29", "v-2"]] as const) {
      await adminAnalyticsRecord(adapter, { kind: "page_view", path: "/pricing", visitorKey: key, at: `${day}T09:00:00.000Z` });
    }
    await adminAnalyticsRecord(adapter, { kind: "page_view", path: "/pricing", visitorKey: null, at: "2026-09-29T10:00:00.000Z" });
    await adminAnalyticsRecord(adapter, { kind: "page_view", path: "/pricing", at: "2026-10-20T10:00:00.000Z" });

    const series = await adminAnalyticsSeries(adapter, { range: RANGE });
    expect(series.points.map((point) => point.views)).toEqual([0, 2, 2, 0]);
    expect(series.totals.views).toBe(4);
    expect(series.totals.visitors).toBe(2);
    expect(series.totals.unattributed).toBe(1);

    // The October view is in the table and in neither the points nor the total, because the range is
    // enforced at the read rather than left for the aggregation to notice afterwards.
    const all = await adminAnalyticsRead(adapter);
    expect(all).toHaveLength(5);
  });

  it("prunes the rows older than the window the host named", async () => {
    const { sql, adapter } = migrated();
    await migrateDemo(sql, MIGRATIONS);
    resetTursoAdapterCache();

    for (const day of ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-29"]) {
      await adminAnalyticsRecord(adapter, { kind: "page_view", path: "/p", visitorKey: "v-1", at: `${day}T12:00:00.000Z` });
    }

    const result = await adminAnalyticsRetain(adapter, { days: 10, now: CLOCK });
    expect(result.removed).toBe(2);

    const left: AdminAnalyticsEventRow[] = await adapter.query("analytics_events");
    expect(left.map((row) => row.occurred_at).sort()).toEqual([
      "2026-09-20T12:00:00.000Z",
      "2026-09-29T12:00:00.000Z",
    ]);
  });

  it("is created by a migration that runs before every migration touching it", () => {
    // Keyed by file name, so a file that sorts early would run before the tables it assumes exist.
    //
    // This used to assert that the creating file was the *last* one, which is a proxy for the property
    // that matters and is stricter than it: it forbids any later migration, including one that touches
    // an unrelated table. Migration 0011, which only rewrites dashboard placements, failed it. The
    // property is ordering against the files that depend on this table, so that is what is asserted.
    const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
    const creator = files.findIndex((name) =>
      readFileSync(join(MIGRATIONS, name), "utf8").includes("CREATE TABLE IF NOT EXISTS analytics_events"),
    );
    expect(creator).toBeGreaterThan(0);
    expect(files[creator]).toMatch(/^\d{4}_/);

    const later = files.slice(creator + 1);
    for (const name of later) {
      const body = readFileSync(join(MIGRATIONS, name), "utf8");
      // A later file may use the table, never drop or redefine it, or the demo would lose its own rows.
      expect(body).not.toMatch(/DROP\s+TABLE[^;]*analytics_events/);
      expect(body).not.toMatch(/CREATE\s+TABLE(?!\s+IF\s+NOT\s+EXISTS)[^;]*analytics_events/);
    }
  });
});
