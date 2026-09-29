// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  adminChartAxis,
  adminChartDayKey,
  adminChartDayRange,
  adminChartFillDays,
  adminChartLabelIndices,
  adminChartTicks,
  adminFormatCents,
  adminFormatCentsCompact,
  adminFormatCount,
} from "../src/charts/index";

/**
 * The arithmetic behind a chart, checked without a DOM.
 *
 * The two properties worth a test here are the ones a browser cannot report. A bar taller than its
 * own axis is silent: it is simply clipped or rescaled, and the page still looks like a chart. And
 * a total that is right on screen can still be built by adding formatted strings, which only fails
 * once rounding is involved.
 */

describe("axis ticks land on round numbers above the data", () => {
  it("covers the maximum, so the tallest mark is never taller than the axis", () => {
    // Every maximum in this list produced a top below it, and the peak bar was drawn off the plot.
    for (const max of [1, 3, 7, 9, 42, 128, 999, 1234, 5678, 12345, 99999, 123456, 1234567]) {
      const ticks = adminChartTicks(max, 4);
      expect(ticks[ticks.length - 1], `max ${max}`).toBeGreaterThanOrEqual(max);
      expect(ticks[0], `max ${max}`).toBe(0);
    }
  });

  it("keeps every tick whole when the domain counts things", () => {
    for (const max of [1, 3, 7, 58, 999, 12345]) {
      const offenders = adminChartTicks(max, 4, true).filter((tick) => !Number.isInteger(tick));
      expect(offenders, `max ${max}`).toEqual([]);
    }
  });

  it("keeps every tick whole when the domain is money in cents", () => {
    // 2.5 dollars is a gridline nobody can read, and cents are integers, so the axis has to be too.
    for (const cents of [1, 7, 250, 4900, 128400, 1234567]) {
      const offenders = adminChartTicks(cents, 4, true).filter((tick) => !Number.isInteger(tick));
      expect(offenders, `${cents} cents`).toEqual([]);
    }
  });

  it("does not print float noise on a tick", () => {
    // 0.1 * 3 is 0.30000000000000004, and an axis that prints it looks broken.
    expect(adminChartTicks(0.3, 3)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("survives a domain with nothing in it rather than dividing by zero", () => {
    expect(adminChartTicks(0, 4)).toEqual([0]);
    expect(adminChartTicks(-5, 4)).toEqual([0]);
    expect(adminChartTicks(Number.NaN, 4)).toEqual([0]);
    expect(adminChartAxis(0).fraction(0)).toBe(0);
  });

  it("pins a value outside the domain to an edge instead of drawing it off the plot", () => {
    const axis = adminChartAxis(100, { ticks: 4 });
    expect(axis.top).toBe(100);
    expect(axis.fraction(50)).toBeCloseTo(0.5, 10);
    expect(axis.fraction(100)).toBe(0);
    expect(axis.fraction(0)).toBe(1);
    // A row that arrives out of order must not be able to paint above its own axis.
    expect(axis.fraction(5000)).toBe(0);
    expect(axis.fraction(-5000)).toBe(1);
  });
});

describe("axis labels are thinned, not dropped", () => {
  it("keeps the first, the last and a middle label for a long range", () => {
    const chosen = adminChartLabelIndices(30, 7);
    expect(chosen).toHaveLength(7);
    expect(chosen[0]).toBe(0);
    expect(chosen[chosen.length - 1]).toBe(29);
  });

  it("prints every label when the range is short enough to fit them", () => {
    expect(adminChartLabelIndices(7, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(adminChartLabelIndices(0, 7)).toEqual([]);
  });
});

describe("money is formatted from integer cents", () => {
  it("divides by 100 at the display, not before", () => {
    expect(adminFormatCents(12840)).toBe("$128.40");
    expect(adminFormatCents(0)).toBe("$0.00");
    expect(adminFormatCents(5)).toBe("$0.05");
  });

  it("keeps a cent the float arithmetic would otherwise drop", () => {
    // 0.1 + 0.2 style drift shows up here: 1234567 / 100 has to render $12,345.67 exactly.
    expect(adminFormatCents(1234567)).toBe("$12,345.67");
    expect(adminFormatCents(999999999)).toBe("$9,999,999.99");
  });

  it("shortens an axis tick without shortening the total it labels", () => {
    expect(adminFormatCentsCompact(1284000)).toBe("$12.8K");
    expect(adminFormatCents(1284000)).toBe("$12,840.00");
  });

  it("counts things that are not money", () => {
    expect(adminFormatCount(1234)).toBe("1,234");
    expect(adminFormatCount(0)).toBe("0");
  });
});

describe("a day is a calendar day, not a parse of the server's clock", () => {
  it("reads the UTC day out of both timestamp shapes the store produces", () => {
    // SQLite's datetime('now') uses a space and no zone; ISO uses T and Z. Both start the same way.
    expect(adminChartDayKey("2026-09-29 12:34:56")).toBe("2026-09-29");
    expect(adminChartDayKey("2026-09-29T12:34:56.000Z")).toBe("2026-09-29");
    expect(adminChartDayKey("  2026-01-02T23:59:59.000Z  ")).toBe("2026-01-02");
  });

  it("refuses a value that is not a timestamp rather than inventing a day for it", () => {
    expect(adminChartDayKey("")).toBeNull();
    expect(adminChartDayKey("not a date")).toBeNull();
    expect(adminChartDayKey("2026-9-1")).toBeNull();
  });

  it("walks a range backwards to oldest first", () => {
    const range = adminChartDayRange(3, new Date("2026-09-29T18:00:00.000Z"));
    expect(range).toEqual(["2026-09-27", "2026-09-28", "2026-09-29"]);
  });

  it("crosses a month boundary without skipping or repeating a day", () => {
    const range = adminChartDayRange(4, new Date("2026-03-02T06:00:00.000Z"));
    expect(range).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});

describe("a day with no rows is a zero, not a missing point", () => {
  it("emits one point per day in the range, filling the gaps", () => {
    // A chart built from the rows alone draws a straight line across a weekend and calls it a trend.
    const points = adminChartFillDays(
      ["2026-09-27", "2026-09-28", "2026-09-29"],
      new Map([["2026-09-28", 4900]]),
      (key) => key.slice(5),
    );
    expect(points).toEqual([
      { key: "2026-09-27", label: "09-27", value: 0 },
      { key: "2026-09-28", label: "09-28", value: 4900 },
      { key: "2026-09-29", label: "09-29", value: 0 },
    ]);
  });

  it("reports an empty store as a full range of zeros, which is what makes the empty state reachable", () => {
    const range = adminChartDayRange(14, new Date("2026-09-29T00:00:00.000Z"));
    const points = adminChartFillDays(range, new Map(), (key) => key);
    expect(points).toHaveLength(14);
    expect(points.every((point) => point.value === 0)).toBe(true);
  });
});
