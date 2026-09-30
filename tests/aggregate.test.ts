// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { adminAggregate, adminAggregateTotals, adminWholeNumber } from "../src/aggregate";
import { adminChartDayKey, adminChartDayRange } from "../src/charts";

/**
 * The bucketing a host would otherwise write, with the numbers written down rather than computed twice.
 *
 * Each expectation here is a value a reader could add up on paper from the rows in the test, because a
 * property proved by a second implementation of the arithmetic proves nothing when both are wrong
 * together. The dates are fixed rather than read off a clock, so a test that fails says which row was
 * counted and which was not rather than that a figure moved.
 */

type Order = { id: string; total_cents: number; created_at?: string };

const orders: Order[] = [
  { id: "a", total_cents: 4900, created_at: "2026-09-28 09:00:00" },
  { id: "b", total_cents: 3200, created_at: "2026-09-28T23:59:00.000Z" },
  { id: "c", total_cents: 12500, created_at: "2026-09-29 01:00:00" },
];

/** Revenue per day over an explicit range, which is what a host writes to draw a chart of money. */
function revenueByDay(rows: readonly Order[], range: readonly string[]) {
  return adminAggregate({
    rows,
    range,
    key: (order) => adminChartDayKey(order.created_at ?? ""),
    measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
  });
}

const week = adminChartDayRange(7, new Date("2026-09-30T12:00:00.000Z"));

describe("the periods a chart is drawn over", () => {
  it("keeps a row past the end of the range out of the buckets and out of the total", () => {
    // The row the demo's own comment is about: it carries money, it is dated after the last day, and
    // both the axis and the sentence beside it have to agree about it.
    const rows: Order[] = [
      ...orders,
      { id: "late", total_cents: 99999, created_at: "2026-10-02 08:00:00" },
      { id: "early", total_cents: 77777, created_at: "2026-09-01 08:00:00" },
    ];

    const result = revenueByDay(rows, week);

    // 4900 + 3200 on the 28th, 12500 on the 29th, and the 30th is a real day with nothing on it. The
    // two rows outside the range are in neither the points nor the total.
    expect(result.buckets.map((bucket) => [bucket.key, bucket.values.cents])).toEqual([
      ["2026-09-24", 0],
      ["2026-09-25", 0],
      ["2026-09-26", 0],
      ["2026-09-27", 0],
      ["2026-09-28", 8100],
      ["2026-09-29", 12500],
      ["2026-09-30", 0],
    ]);
    expect(result.totals.cents).toBe(20600);
    expect(result.outOfRange).toBe(2);
    // 4900 + 3200 + 12500 on paper, which is what makes 20600 a checked figure rather than a repeat.
    expect(4900 + 3200 + 12500).toBe(20600);
  });

  it("holds a run of empty days as zeros between the days that carry money", () => {
    // Nine days from the 22nd to the 30th, money on the 22nd and the 30th and nothing in the seven
    // between them. A gap in the middle of a series is the case most likely to be drawn as a straight
    // line and read as a trend, and it is the one an empty middle does not make obvious.
    const rows: Order[] = [
      { id: "open", total_cents: 1000, created_at: "2026-09-22 09:00:00" },
      { id: "close", total_cents: 2000, created_at: "2026-09-30 09:00:00" },
    ];
    const range = adminChartDayRange(9, new Date("2026-09-30T12:00:00.000Z"));

    const result = revenueByDay(rows, range);

    expect(result.buckets).toHaveLength(9);
    expect(result.buckets.map((bucket) => bucket.key)).toEqual(range);
    expect(result.buckets.map((bucket) => bucket.values.cents)).toEqual([1000, 0, 0, 0, 0, 0, 0, 0, 2000]);
    // Each of the seven empty days is present and holding a zero rather than absent, which is the
    // difference between a zero and a hole in the axis.
    const middle = result.buckets.slice(1, 8);
    expect(middle).toHaveLength(7);
    expect(middle.every((bucket) => bucket.values.cents === 0 && bucket.records === 0)).toBe(true);
    expect(result.totals.cents).toBe(3000);
  });

  it("answers with a full range of zeros when no row falls in it", () => {
    const result = revenueByDay(orders, adminChartDayRange(4, new Date("2026-01-02T00:00:00.000Z")));

    // Every period present, every value zero, and a total that is a fact about the range rather than
    // an absence of one.
    expect(result.buckets).toHaveLength(4);
    expect(result.buckets.every((bucket) => bucket.values.cents === 0)).toBe(true);
    expect(result.totals.cents).toBe(0);
    expect(result.totalRecords).toBe(0);
  });

  it("emits one bucket per period when the range lists one period twice", () => {
    const result = revenueByDay(orders, ["2026-09-28", "2026-09-28", "2026-09-29"]);

    // A repeated period is a host's slip in the list, not two periods. Two identical buckets would put
    // a doubled bar on the axis and twice the money in the chart's own total.
    expect(result.buckets.map((bucket) => bucket.key)).toEqual(["2026-09-28", "2026-09-29"]);
    expect(result.totals.cents).toBe(20600);
  });
});

describe("a row the key cannot place", () => {
  it("counts it as unkeyed and keeps it out of the buckets and the total", () => {
    // The shape a seeded order in the demo's memory store really has: a total and a status with no
    // moment on them, because that store writes no column defaults.
    const rows: Order[] = [...orders, { id: "undated", total_cents: 5000 }];

    const result = revenueByDay(rows, week);

    // It is reported rather than dropped, so a host can see that its rows are not being placed. It is
    // in neither the points nor the total, because there is no day to draw it on and filing it under
    // the epoch would put a spike at the start of the range that no order was placed on.
    expect(result.unkeyed).toBe(1);
    expect(result.buckets).toHaveLength(7);
    expect(result.buckets.some((bucket) => bucket.values.cents === 5000)).toBe(false);
    expect(result.totals.cents).toBe(20600);
  });

  it("counts a key that is only whitespace as no key at all", () => {
    const result = revenueByDay([{ id: "blank", total_cents: 500, created_at: "" }], week);

    expect(result.unkeyed).toBe(1);
    expect(result.totalRecords).toBe(0);
  });

  it("keeps every row when no range is stated, so a grouping is a grouping and not a window", () => {
    const result = adminAggregate({
      rows: orders,
      key: (order) => adminChartDayKey(order.created_at ?? ""),
      measures: { cents: (order) => order.total_cents },
    });

    // No range means no bound, so the buckets are the periods the rows named, in the order they
    // first appeared, and nothing is out of range.
    expect(result.buckets.map((bucket) => bucket.key)).toEqual(["2026-09-28", "2026-09-29"]);
    expect(result.outOfRange).toBe(0);
    expect(result.totals.cents).toBe(20600);
  });
});

describe("the total beside the drawing", () => {
  it("adds the buckets up to the total, for a range that is not all of the rows", () => {
    // Asserted against the buckets rather than against a written figure, so the test is the property
    // and not the arithmetic restated: a total that drifts from its own series is the bug this
    // catches, and a hardcoded number would still pass when the two were changed together.
    const rows: Order[] = [
      ...orders,
      { id: "d", total_cents: 900, created_at: "2026-09-29 13:00:00" },
      { id: "late", total_cents: 99999, created_at: "2026-10-02 08:00:00" },
      { id: "undated", total_cents: 5000 },
    ];

    const result = revenueByDay(rows, week);

    const summed = result.buckets.reduce((total, bucket) => total + bucket.values.cents, 0);
    expect(result.totals.cents).toBe(summed);
    expect(result.totalRecords).toBe(
      result.buckets.reduce((total, bucket) => total + bucket.records, 0),
    );
    // And the two exclusions are the only reason the two would otherwise differ.
    expect(result.outOfRange + result.unkeyed).toBe(2);
    expect(summed).toBe(21500);
  });

  it("agrees with the buckets for a measure that is not money and not a count", () => {
    // Two measures over the same rows, one of them a product of two columns, which is the case a
    // second accumulator beside the buckets gets wrong.
    const products = [
      { id: "p1", name: "Lamp", price_cents: 2500, stock: 4 },
      { id: "p2", name: "Tray", price_cents: 900, stock: 10 },
    ];

    const result = adminAggregate({
      rows: products,
      key: (product) => product.id,
      measures: {
        units: (product) => adminWholeNumber(product.stock, "stock"),
        cents: (product) => adminWholeNumber(product.price_cents, "price_cents") * adminWholeNumber(product.stock, "stock"),
      },
    });

    expect(result.totals.units).toBe(14);
    expect(result.totals.cents).toBe(
      result.buckets.reduce((total, bucket) => total + bucket.values.cents, 0),
    );
    // 2500 * 4 + 900 * 10 on paper.
    expect(result.totals.cents).toBe(10000 + 9000);
    expect(result.totalRecords).toBe(2);
  });
});

describe("what a measure is allowed to answer", () => {
  it("refuses a column that is not a whole number rather than summing it", () => {
    // 19.99 dollars summed as a float is a total that reads correctly and disagrees with the ledger,
    // so the guard is at the point the column is read and the reason names the column.
    expect(() => adminWholeNumber(19.99, "total_cents")).toThrow(/total_cents is not a whole number/);
    expect(() => adminWholeNumber("4900", "total_cents")).toThrow(/total_cents/);
    expect(() => adminWholeNumber(Number.NaN, "total_cents")).toThrow(/total_cents/);
    expect(adminWholeNumber(1999, "total_cents")).toBe(1999);
  });

  it("accepts a bigint, because a 64-bit driver is still an integer", () => {
    expect(adminWholeNumber(9_007_199_254_740_993n, "total_cents")).toBe(9_007_199_254_740_992 + 1);
  });

  it("refuses a measure that answered something which cannot be added up", () => {
    // NaN on a chart is not a bar reading NaN, it is a bar shorter than the number it was given.
    expect(() =>
      adminAggregate({
        rows: orders,
        key: (order) => order.id,
        measures: { cents: () => Number.NaN },
      }),
    ).toThrow(/the measure "cents" answered/);

    expect(() =>
      adminAggregateTotals({
        rows: orders,
        measures: { cents: () => Number.POSITIVE_INFINITY },
      }),
    ).toThrow(/the measure "cents" answered/);
  });
});

describe("the measures a tile reads beside its chart", () => {
  it("sums the same measures over the same rows with nothing bucketed", () => {
    const totals = adminAggregateTotals({
      rows: orders,
      measures: {
        revenueCents: (order) => adminWholeNumber(order.total_cents, "total_cents"),
        paidOrders: () => 1,
      },
    });

    expect(totals).toEqual({ revenueCents: 20600, paidOrders: 3 });
  });

  it("answers zeros for rows it has none of", () => {
    expect(
      adminAggregateTotals({ rows: [], measures: { revenueCents: (order: Order) => order.total_cents } }),
    ).toEqual({ revenueCents: 0 });
  });
});
