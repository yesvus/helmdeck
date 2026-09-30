// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { adminAggregate, adminAggregateTotals, adminWholeNumber } from "../src/aggregate";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { createSqlitePersistenceAdapter } from "../src/baseline/sqlite";
import { adminChartDayKey, adminChartDayRange } from "../src/charts";
import type { AdminPersistenceAdapter } from "../src/adapters";

/**
 * The same rows through both stores the package ships, aggregated the same way.
 *
 * The two adapters are interchangeable by contract and this is where that is checked against the
 * aggregation rather than against a read. The demo runs on whichever one the environment supplies, so
 * a bucketing that agreed on one store and not the other would make a chart's figures depend on
 * configuration, which is the failure nothing on the page can show.
 *
 * `file::memory:` gives the SQLite adapter a real database rather than a recorded client, because the
 * question here is what comes back out of a JSON document column, and a fake client can only confirm
 * the strings it was handed. The rows are written through `create`, read back through `query`, and the
 * answers are compared with `toEqual` on the whole result, so a difference in a label or a count fails
 * rather than being averaged away.
 */

type Order = { id: string; customer: string; status: string; total_cents: number; created_at: string };

const ORDERS: Omit<Order, "id">[] = [
  { customer: "Ada", status: "paid", total_cents: 4900, created_at: "2026-09-28 09:00:00" },
  { customer: "Grace", status: "shipped", total_cents: 3200, created_at: "2026-09-28T23:59:00.000Z" },
  { customer: "Alan", status: "paid", total_cents: 12500, created_at: "2026-09-29 01:00:00" },
  { customer: "Katherine", status: "paid", total_cents: 900, created_at: "2026-09-29 13:00:00" },
  { customer: "Edsger", status: "cancelled", total_cents: 100, created_at: "2026-09-29 14:00:00" },
  { customer: "Barbara", status: "paid", total_cents: 60000, created_at: "2026-10-02 08:00:00" },
  { customer: "Radia", status: "paid", total_cents: 70000, created_at: "2026-09-01 08:00:00" },
];

const EARNED = new Set(["paid", "shipped"]);

const range = adminChartDayRange(7, new Date("2026-09-30T12:00:00.000Z"));

/** The two shipped stores, seeded with the same rows through the same contract. */
async function seededStores(): Promise<[string, AdminPersistenceAdapter][]> {
  const stores: [string, AdminPersistenceAdapter][] = [
    ["memory", createMemoryPersistenceAdapter() as AdminPersistenceAdapter],
    ["sqlite", createSqlitePersistenceAdapter({ url: "file::memory:" })],
  ];
  for (const [, store] of stores) {
    for (const order of ORDERS) {
      await store.create("orders", { ...order });
    }
  }
  return stores;
}

/** Revenue per day over the range, the way a host's server action would answer a chart tile. */
function revenueByDay(rows: readonly Order[]) {
  return adminAggregate({
    rows,
    range,
    key: (order) => adminChartDayKey(order.created_at),
    measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
  });
}

describe("both shipped stores answer the same chart", () => {
  it("buckets the same rows onto the same periods, with the same total", async () => {
    const stores = await seededStores();
    const answers = new Map<string, ReturnType<typeof revenueByDay>>();

    for (const [name, store] of stores) {
      const rows = await store.query<Order>("orders");
      answers.set(name, revenueByDay(rows.filter((row) => EARNED.has(row.status))));
    }

    // One bucket per day in the range on both, so the axis a reader sees is the axis the store gave.
    for (const result of answers.values()) expect(result.buckets).toHaveLength(7);
    // The 28th and the 29th carry the money, and the 30th is a real day with nothing on it.
    expect(answers.get("memory")!.buckets.map((bucket) => bucket.values.cents)).toEqual([
      0, 0, 0, 0, 8100, 13400, 0,
    ]);
    // 4900 + 3200 + 12500 + 900, and neither of the two rows outside the range is in it.
    expect(answers.get("memory")!.totals.cents).toBe(21500);
    expect(answers.get("memory")!.outOfRange).toBe(2);

    // The whole result compared, not the figure: a store that ordered its rows differently, or held
    // the count of rows per period differently, is a different answer and fails here.
    expect(answers.get("sqlite")).toEqual(answers.get("memory"));
  });

  it("counts the rows behind the total the same way on both", async () => {
    const stores = await seededStores();
    const counted = new Map<string, { revenueCents: number; paidOrders: number }>();

    for (const [name, store] of stores) {
      const rows = await store.query<Order>("orders");
      counted.set(
        name,
        adminAggregateTotals<Order, { revenueCents: number; paidOrders: number }>({
          rows: rows.filter((row) => EARNED.has(row.status)),
          measures: {
            revenueCents: (row) => adminWholeNumber(row.total_cents, "total_cents"),
            paidOrders: () => 1,
          },
        }),
      );
    }

    // No range on this one, so the total covers every earned order in the store rather than the seven
    // days above: 4900 + 3200 + 12500 + 900 + 60000 + 70000 over the six that are paid or shipped,
    // with the cancelled one excluded by name.
    expect(counted.get("memory")).toEqual({ revenueCents: 151500, paidOrders: 6 });
    expect(counted.get("sqlite")).toEqual(counted.get("memory"));
  });

  it("holds a range neither store has a row in, the same way on both", async () => {
    const stores = await seededStores();
    const empties = new Map<string, ReturnType<typeof revenueByDay>>();

    for (const [name, store] of stores) {
      const rows = await store.query<Order>("orders");
      // A range that ends before anything was placed, which is what a host's default window does on
      // a store somebody else has just been given.
      empties.set(
        name,
        adminAggregate({
          rows,
          range: adminChartDayRange(4, new Date("2026-01-02T00:00:00.000Z")),
          key: (order) => adminChartDayKey(order.created_at),
          measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
        }),
      );
    }

    for (const result of empties.values()) {
      expect(result.buckets).toHaveLength(4);
      expect(result.buckets.every((bucket) => bucket.values.cents === 0)).toBe(true);
      expect(result.totals.cents).toBe(0);
    }
    expect(empties.get("sqlite")).toEqual(empties.get("memory"));
  });
});

/**
 * The shape a capture layer will write, aggregated without being known to it.
 *
 * This is a fixture and not a feature: nothing captures anything, and the event has no resource, no
 * permissions and no visitor identity. It is here so the seam is written down and exercised, because
 * the aggregation takes a row and a key function and does not care whether the row is an order or
 * something a person did, and the layer that records the second kind is the one that has to be argued
 * about on its own terms.
 */
type CapturedEvent = { id: string; kind: string; at: string; weight?: number };

const EVENTS: CapturedEvent[] = [
  { id: "e1", kind: "page_view", at: "2026-09-28 09:00:00", weight: 1 },
  { id: "e2", kind: "page_view", at: "2026-09-28 10:00:00", weight: 1 },
  { id: "e3", kind: "signup", at: "2026-09-29 01:00:00", weight: 1 },
  { id: "e4", kind: "page_view", at: "2026-09-29 02:00:00", weight: 1 },
  { id: "e5", kind: "page_view", at: "2026-10-01 02:00:00", weight: 1 },
  { id: "e6", kind: "page_view", at: "not a moment", weight: 1 },
];

describe("a captured event is a row this already knows how to bucket", () => {
  it("counts them per day over a range, with the same three rules an order goes through", () => {
    const viewsByDay = adminAggregate({
      rows: EVENTS,
      range,
      key: (event) => adminChartDayKey(event.at),
      measures: { views: (event) => event.weight ?? 1 },
    });

    // 28th has two, 29th has two, and the last four days of the range are real days with nothing on
    // them. The same zeros, the same total, the same exclusions: no branch in the aggregation that
    // knows what a row is.
    expect(viewsByDay.buckets.map((bucket) => bucket.values.views)).toEqual([0, 0, 0, 0, 2, 2, 0]);
    expect(viewsByDay.totals.views).toBe(4);
    // The event dated past the end of the range and the one carrying no moment, both out of the total.
    expect(viewsByDay.outOfRange).toBe(1);
    expect(viewsByDay.unkeyed).toBe(1);
  });

  it("counts them per kind, which needs no moment and no range", () => {
    const byKind = adminAggregate({
      rows: EVENTS,
      key: (event) => event.kind,
      measures: { events: () => 1 },
    });

    // Two keys and no third, because every event here names one. With no range, the event dated past
    // the 30th and the one carrying no moment are both counted: a key of "page_view" does not care
    // when it happened. The ordering is first appearance, which is the store's row order and nothing
    // more. Five views, being e1, e2, e4, e5 and e6.
    expect(byKind.buckets).toEqual([
      { key: "page_view", label: "page_view", values: { events: 5 }, records: 5 },
      { key: "signup", label: "signup", values: { events: 1 }, records: 1 },
    ]);
    expect(byKind.totalRecords).toBe(6);
    expect(byKind.unkeyed).toBe(0);
    expect(byKind.outOfRange).toBe(0);
  });
});
