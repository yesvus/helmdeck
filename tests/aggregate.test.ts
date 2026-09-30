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
    // A hand-written key, because this is the case one of those produces: a store column holding a
    // blank rather than nothing, which is what a padded CHAR column and a submitted empty field both
    // give. Read as a period, " " puts the row on the axis under a label made of nothing.
    const result = adminAggregate({
      rows: [{ id: "blank", region: " ", total_cents: 500 }],
      key: (row) => row.region,
      measures: { cents: (row) => row.total_cents },
      range: ["2026-09-29"],
    });

    expect(result.unkeyed).toBe(1);
    expect(result.totalRecords).toBe(0);
    expect(result.buckets).toHaveLength(1);
    expect(result.totals.cents).toBe(0);
  });

  it("accepts a key with space around it as the period it names", () => {
    // The other half of the same rule: a key padded with space names the period inside it, so a host
    // that builds keys by concatenation is not silently excluded from its own chart.
    const result = adminAggregate({
      rows: [{ id: "padded", region: " 2026-09-29 ", total_cents: 500 }],
      key: (row) => row.region,
      measures: { cents: (row) => row.total_cents },
      range: ["2026-09-29"],
    });

    expect(result.unkeyed).toBe(0);
    expect(result.buckets[0]).toMatchObject({ key: "2026-09-29", values: { cents: 500 }, records: 1 });
  });

  it("keeps every row when no range is stated, so a grouping is a grouping and not a window", () => {
    // Deliberately out of order: the 29th is read before the 28th, so first-appearance order and
    // sorted order are different answers and the test can tell which one came back.
    const rows: Order[] = [
      { id: "c", total_cents: 12500, created_at: "2026-09-29 01:00:00" },
      { id: "a", total_cents: 4900, created_at: "2026-09-28 09:00:00" },
      { id: "b", total_cents: 3200, created_at: "2026-09-28T23:59:00.000Z" },
    ];

    const result = adminAggregate({
      rows,
      key: (order) => adminChartDayKey(order.created_at ?? ""),
      measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
    });

    // No range means no bound, so the buckets are the periods the rows named, in the order the rows
    // arrived, and nothing is out of range. Every row is in one of them.
    expect(result.buckets.map((bucket) => bucket.key)).toEqual(["2026-09-29", "2026-09-28"]);
    expect(result.buckets.map((bucket) => bucket.values.cents)).toEqual([12500, 8100]);
    expect(result.outOfRange).toBe(0);
    expect(result.unkeyed).toBe(0);
    expect(result.totalRecords).toBe(3);
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

  it("accepts a bigint inside the range a number can hold exactly", () => {
    expect(adminWholeNumber(9_007_199_254_740_991n, "total_cents")).toBe(9_007_199_254_740_991);
    expect(adminWholeNumber(-9_007_199_254_740_991n, "total_cents")).toBe(-9_007_199_254_740_991);
    expect(adminWholeNumber(0n, "total_cents")).toBe(0);
  });

  it("refuses a bigint past that range rather than rounding it into a different amount", () => {
    // 2^53 + 1. It is an integer and it is exactly representable as a bigint, so it passes every
    // integer check, and `Number()` turns it into 2^53. A money total wrong by one and looking right
    // is the failure this layer exists to make impossible, and the earlier version of this test
    // asserted the rounding as correct.
    expect(() => adminWholeNumber(9_007_199_254_740_993n, "total_cents")).toThrow(
      /total_cents is past the largest exact integer/,
    );
    expect(() => adminWholeNumber(-(9_007_199_254_740_993n), "total_cents")).toThrow(/total_cents/);
  });

  it("refuses a number that is an integer only because its precision is already gone", () => {
    // `Number.isInteger(2 ** 53)` is true, so an integer check admits this. The value is already
    // inexact before the guard sees it, and no amount of checking downstream can recover it.
    expect(Number.isInteger(2 ** 53)).toBe(true);
    expect(() => adminWholeNumber(2 ** 53, "total_cents")).toThrow(
      /total_cents is an integer whose precision is already lost/,
    );
  });

  it("sums a run of exact values that a float could not hold, rather than the rounded one", () => {
    // The end-to-end shape of the same defect: a total assembled from values that are individually
    // refused would be refused, and the one that is not refused must still be exact.
    const rows = Array.from({ length: 3 }, () => ({ id: "o1", total_cents: 4_000_000_000_000 }));
    const result = adminAggregate({
      rows,
      range: ["d1"],
      key: () => "d1",
      measures: { cents: (row) => adminWholeNumber(row.total_cents, "total_cents") },
    });
    expect(result.totals.cents).toBe(12_000_000_000_000);
    expect(result.buckets[0]?.values.cents).toBe(12_000_000_000_000);
  });

  it("refuses a sum that crosses the boundary, naming the measure and the period", () => {
    // 2000 rows of 9e12. Each one is well inside the range a number holds exactly, so the per-value
    // guard sees nothing wrong with any of them, and the total is past what a double can carry.
    const rows = Array.from({ length: 2000 }, (_, index) => ({ id: `o${index}`, total_cents: 9_000_000_000_000 }));
    const truth = rows.reduce((total, row) => total + BigInt(row.total_cents), 0n);

    // The sum really is out of range, asserted against the exact total rather than a written figure,
    // so the test is about the boundary and not about this fixture's arithmetic.
    expect(truth).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(Number.isSafeInteger(Number(truth))).toBe(false);

    expect(() =>
      adminAggregate({
        rows,
        range: ["d1"],
        key: () => "d1",
        measures: { cents: (row) => row.total_cents },
      }),
    ).toThrow(/the measure "cents" summed to \d+ over "d1", past the largest whole number/);
  });

  it("refuses the same crossing in the totals-only API, which has no buckets to check", () => {
    // This one has no periods and no `range`, so the only place a crossing can be caught is the
    // running total, and an implementation that guarded the buckets alone would pass every other test
    // in this file and miss this defect entirely.
    const rows = Array.from({ length: 2000 }, () => ({ total_cents: 9_000_000_000_000 }));

    expect(() =>
      adminAggregateTotals({ rows, measures: { cents: (row) => row.total_cents } }),
    ).toThrow(/the measure "cents" summed to \d+ over every row, past the largest whole number/);
  });

  it("refuses a crossing in one bucket while the others stay inside it", () => {
    // The finding says a total can cross after its buckets are added up, so five buckets that are each
    // exactly representable and a total that is not. 2 ** 52 is inside the range; five of them are not.
    const rows = Array.from({ length: 5 }, (_, index) => ({ id: `d${index}`, total_cents: 2 ** 52 }));
    const truth = rows.reduce((total, row) => total + BigInt(row.total_cents), 0n);
    expect(truth).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    for (const row of rows) expect(Number.isSafeInteger(row.total_cents)).toBe(true);

    expect(() =>
      adminAggregate({
        rows,
        range: ["d0", "d1", "d2", "d3", "d4"],
        key: (row) => row.id,
        measures: { cents: (row) => row.total_cents },
      }),
    ).toThrow(/the measure "cents" summed to \d+ over the whole range/);
  });

  it("refuses a measure that goes past the boundary and comes back under it", () => {
    // The case that decides the guard is per addition rather than per answer. The finished total is 0,
    // which is inside the range and looks fine, and it is wrong by one: the run went to 2 ** 53 + 1,
    // where a double cannot hold the 1, and dropped it on the way down. Checking the answer alone
    // returns 0 and reports nothing.
    const rows = [
      { id: "a", total_cents: 2 ** 53 },
      { id: "b", total_cents: 1 },
      { id: "c", total_cents: -(2 ** 53) },
    ];
    const truth = rows.reduce((total, row) => total + BigInt(row.total_cents), 0n);
    expect(truth).toBe(1n);
    // The unchecked arithmetic, which is what the guard has to catch.
    expect(rows.reduce((total, row) => total + row.total_cents, 0)).toBe(0);

    expect(() =>
      adminAggregate({
        rows,
        range: ["d1"],
        key: () => "d1",
        measures: { cents: (row) => row.total_cents },
      }),
    ).toThrow(/the measure "cents" summed to 9007199254740992/);
  });

  it("refuses a negative measure crossing the boundary, which one direction would miss", () => {
    // Downward, so a comparison written as `sum > MAX` alone lets this through and the total comes
    // back wrong with nothing to show for it. The sum of the negatives is below MIN_SAFE_INTEGER.
    const rows = Array.from({ length: 2000 }, (_, index) => ({ id: `n${index}`, total_cents: -9_000_000_000_000 }));
    const truth = rows.reduce((total, row) => total + BigInt(row.total_cents), 0n);
    expect(truth).toBeLessThan(BigInt(Number.MIN_SAFE_INTEGER));

    expect(() =>
      adminAggregate({
        rows,
        range: ["d1"],
        key: () => "d1",
        measures: { cents: (row) => row.total_cents },
      }),
    ).toThrow(/past the largest whole number/);
    expect(() => adminAggregateTotals({ rows, measures: { cents: (row) => row.total_cents } })).toThrow(
      /past the largest whole number/,
    );
  });

  it("costs a measure that counts rows nothing, because no array is long enough to cross it", () => {
    // The objection to one rule for every measure is that a host counting events should not be refused
    // over a measure of money. It cannot happen, and this is the arithmetic rather than the assertion.
    // A count of one per row would need 9007199254740991 rows to cross the boundary, and the largest
    // array JavaScript can hold has 4294967295 elements, which is 2000 times too few.
    expect(Number.MAX_SAFE_INTEGER).toBeGreaterThan(2 ** 32 - 1);
    // The largest count a whole array of rows can produce, which is 2000 times inside the boundary.
    expect(Number.isSafeInteger(2 ** 32 - 1)).toBe(true);

    // The shape the capture layer actually uses, counted over a length a test can hold.
    const result = adminAggregate({
      rows: Array.from({ length: 100_000 }, (_, index) => ({ id: `e${index}` })),
      range: ["d1"],
      key: () => "d1",
      measures: { views: () => 1, unattributed: () => 0 },
    });
    expect(result.totals.views).toBe(100_000);
    expect(result.totals.unattributed).toBe(0);
    expect(result.totalRecords).toBe(100_000);
  });

  it("leaves a sum inside the boundary exactly as it was", () => {
    // Not a behaviour change for anyone whose totals fit, which is every caller that has not hit this
    // defect. Asserted against the same rows summed in bigint, so the float result is checked against
    // the exact one rather than against a second float.
    const rows = [
      { id: "a", period: "d1", total_cents: 4_900_000_000_000 },
      { id: "b", period: "d1", total_cents: 3_200_000_000_000 },
      { id: "c", period: "d2", total_cents: 12_500_000_000_000 },
    ];
    const result = adminAggregate({
      rows,
      range: ["d1", "d2"],
      key: (row) => row.period,
      measures: { cents: (row) => row.total_cents },
    });

    const exact = (period: string) =>
      rows.filter((row) => row.period === period).reduce((total, row) => total + BigInt(row.total_cents), 0n);
    expect(result.buckets[0]?.values.cents).toBe(Number(exact("d1")));
    expect(result.buckets[1]?.values.cents).toBe(Number(exact("d2")));
    expect(result.totals.cents).toBe(Number(exact("d1") + exact("d2")));
    // 8.1e12 + 12.5e12 on paper, so the expected values are not just the code agreeing with itself.
    expect(result.totals.cents).toBe(8_100_000_000_000 + 12_500_000_000_000);
    expect(Number.isSafeInteger(result.totals.cents)).toBe(true);
  });

  it("returns a number, and a value just inside the boundary, exactly", () => {
    // The boundary case a host is most likely to reach, and the type their existing code expects: a
    // plain number, exactly the integer that went in, with no bigint for them to handle.
    const result = adminAggregate({
      rows: [{ id: "a", total_cents: Number.MAX_SAFE_INTEGER }],
      range: ["d1"],
      key: () => "d1",
      measures: { cents: (row) => row.total_cents },
    });

    expect(typeof result.totals.cents).toBe("number");
    expect(result.totals.cents).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeof result.buckets[0]?.values.cents).toBe("number");
    // One less, which is the largest value a sum of two safe integers cannot represent, so it is the
    // last figure that is unambiguous.
    const justInside = adminAggregateTotals({
      rows: [{ cents: Number.MAX_SAFE_INTEGER - 1 }],
      measures: { cents: (row) => row.cents },
    });
    expect(justInside.cents).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it("leaves a measure of fractions alone, where exactness is not this layer's business", () => {
    // A host measuring a rate chose float arithmetic knowingly, and `0.1 + 0.2` is not `0.3` for
    // reasons that have nothing to do with a boundary. Refusing it would be refusing a legal measure
    // and turning a known property of the numbers into an error a tile shows.
    const result = adminAggregate({
      rows: [{ id: "a", rate: 0.1 }, { id: "b", rate: 0.2 }],
      range: ["d1"],
      key: () => "d1",
      measures: { rate: (row) => row.rate },
    });

    expect(result.totals.rate).toBe(0.1 + 0.2);
    expect(result.totals.rate).toBe(0.30000000000000004);
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
