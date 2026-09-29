// SPDX-License-Identifier: MIT
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminRankChart, AdminTimeSeriesChart, adminChartFormatters } from "../src/charts";

/**
 * The two chart components rendered on their own, with points written down by hand.
 *
 * These are the geometry decisions a database cannot check. A bar wider than its column makes two
 * days read as one, a series whose values do not line up with its categories shifts every value by
 * one, and both render as a plausible-looking chart. The cap that prevents the first is only binding
 * for a short range, so the case has to be constructed rather than stumbled on.
 */

const money = adminChartFormatters("money");
const counts = adminChartFormatters("count");

function days(count: number, value: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `day-${index}`,
    label: `day ${index}`,
    value: value(index),
  }));
}

function marks() {
  return [...document.querySelectorAll("[data-chart-mark]")].map((mark) => {
    const [series, category] = (mark.getAttribute("data-chart-mark") ?? "").split(":");
    return {
      series: series ?? "",
      category: category ?? "",
      x: Number(mark.getAttribute("x")),
      width: Number(mark.getAttribute("width")),
      height: Number(mark.getAttribute("height")),
    };
  });
}

describe("a short range still gets bars narrow enough not to touch", () => {
  it("caps the bar rather than letting it fill or overrun its column", () => {
    // Two categories means each column is about a third of the plot wide, which is far more than a
    // bar should be. Without a cap the two marks run together and the peak reads as both days.
    render(
      <AdminTimeSeriesChart
        ariaLabel="Two days"
        categories={days(2, (index) => (index === 0 ? 5000 : 9000))}
        series={[{ key: "revenue", label: "Revenue", values: [5000, 9000] }]}
        formatters={money}
        integerTicks
      />,
    );

    const drawn = marks();
    expect(drawn).toHaveLength(2);
    const hitWidth = Number(document.querySelector("[data-chart-hit]")?.getAttribute("width"));
    for (const mark of drawn) {
      expect(mark.width).toBeLessThanOrEqual(hitWidth);
      // A share of the column, not a slab filling it. Two bars that each take 72% of a wide column
      // read as two blocks rather than two measurements, so the cap is the thing under test here and
      // the "less than the column" check above is only the weaker half of it.
      expect(mark.width / hitWidth).toBeLessThanOrEqual(0.2);
    }
    const [first, second] = [...drawn].sort((left, right) => left.x - right.x);
    expect(first.x + first.width).toBeLessThanOrEqual(second.x);
  });

  it("splits the column between series rather than stacking them on top of each other", () => {
    render(
      <AdminTimeSeriesChart
        ariaLabel="Two series"
        categories={days(3, (index) => (index + 1) * 1000)}
        series={[
          { key: "revenue", label: "Revenue", values: [1000, 2000, 3000] },
          { key: "orders", label: "Orders", values: [10, 20, 30] },
        ]}
        formatters={money}
        integerTicks
      />,
    );

    const revenue = marks().filter((mark) => mark.series === "revenue");
    const orders = marks().filter((mark) => mark.series === "orders");
    expect(revenue).toHaveLength(3);
    expect(orders).toHaveLength(3);

    // Side by side within the column, and the second starts after the first ends.
    const firstDay = revenue.find((mark) => mark.x === Math.min(...revenue.map((m) => m.x)))!;
    const firstOrder = orders.find((mark) => mark.x === Math.min(...orders.map((m) => m.x)))!;
    expect(firstOrder.x).toBeGreaterThanOrEqual(firstDay.x + firstDay.width);
  });

  it("draws a mark on every day, including the ones holding nothing", () => {
    render(
      <AdminTimeSeriesChart
        ariaLabel="A gap"
        categories={days(3, (index) => (index === 1 ? 4500 : 0))}
        series={[{ key: "revenue", label: "Revenue", values: [0, 4500, 0] }]}
        formatters={money}
        integerTicks
      />,
    );

    // Three marks, one of them standing up. A chart that skipped the empty days would have one mark
    // and would draw a straight line from nothing to something.
    expect(marks()).toHaveLength(3);
    expect(marks().filter((mark) => mark.height > 1)).toHaveLength(1);
  });

  it("scales every series against the largest value on the chart", () => {
    render(
      <AdminTimeSeriesChart
        ariaLabel="Two scales"
        categories={days(2, () => 0)}
        series={[
          { key: "revenue", label: "Revenue", values: [74000, 0] },
          { key: "orders", label: "Orders", values: [7400, 0] },
        ]}
        formatters={money}
        integerTicks
      />,
    );

    // Two series on one axis: the smaller is a tenth of the larger and is drawn at a tenth of the
    // height, not against an axis of its own. A per-series axis would make two unrelated quantities
    // look like they agree. Keyed by category because the two marks sit at different x.
    const firstDay = marks().filter((mark) => mark.category === "day-0");
    const revenue = firstDay.find((mark) => mark.series === "revenue")!;
    const orders = firstDay.find((mark) => mark.series === "orders")!;
    const heights = [revenue.height, orders.height].filter((height) => height > 1);
    expect(heights).toHaveLength(2);
    expect(heights[0] / heights[1]).toBeCloseTo(10, 1);
  });
});

describe("hovering a column reads out the value", () => {
  it("shows the day and every series' value, and clears when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(
      <AdminTimeSeriesChart
        ariaLabel="Hover readout"
        categories={days(3, (index) => (index + 1) * 1000)}
        series={[{ key: "revenue", label: "Revenue", values: [1000, 2000, 3000] }]}
        formatters={money}
        integerTicks
      />,
    );

    const hits = document.querySelectorAll("[data-chart-hit]");
    const readout = () => document.querySelector("[role='status']");
    expect(readout()).toBeNull();

    await user.hover(hits[1]);
    // 2000 cents, every digit, because the readout is where the exact amount belongs. Scoped to the
    // readout because the hidden table carries the same figures by design.
    const hovered = within(readout() as HTMLElement);
    expect(hovered.getByText("day 1")).toBeInTheDocument();
    expect(hovered.getByText("$20.00")).toBeInTheDocument();

    await user.unhover(hits[1]);
    expect(readout()).toBeNull();
  });

  it("reads out a day that has no value, rather than showing nothing at all", async () => {
    const user = userEvent.setup();
    render(
      <AdminTimeSeriesChart
        ariaLabel="Hover a gap"
        categories={days(3, (index) => (index === 1 ? 4500 : 0))}
        series={[{ key: "revenue", label: "Revenue", values: [0, 4500, 0] }]}
        formatters={money}
        integerTicks
      />,
    );

    const hits = document.querySelectorAll("[data-chart-hit]");
    await user.hover(hits[0]);
    // Zero is an answer. A gap that shows no readout is indistinguishable from a hover that failed.
    expect(within(document.querySelector("[role='status']") as HTMLElement).getByText("$0.00")).toBeInTheDocument();
  });
});

describe("the line variant", () => {
  it("draws a path and a dot per point rather than no mark at all", () => {
    render(
      <AdminTimeSeriesChart
        ariaLabel="A line"
        variant="line"
        categories={days(4, (index) => (index + 1) * 1000)}
        series={[{ key: "views", label: "Views", values: [1000, 4000, 2000, 3000] }]}
        formatters={counts}
        integerTicks
      />,
    );

    const polyline = document.querySelector("polyline");
    expect(polyline).not.toBeNull();
    // One dot per point, or a line with no way to find where the values are.
    expect(document.querySelectorAll("circle")).toHaveLength(4);
    expect(polyline?.getAttribute("points")?.split(" ")).toHaveLength(4);
    // And no bars behind it: the two variants are different drawings, not the same drawing with a
    // line laid over the top of it.
    expect(document.querySelectorAll("rect[data-chart-mark]")).toHaveLength(0);
  });
});

describe("the ranked chart", () => {
  it("scales every bar against the same axis, largest first", () => {
    render(
      <AdminRankChart
        ariaLabel="Units"
        items={[
          { key: "a", label: "Amber lamp", value: 58 },
          { key: "b", label: "Ash desk", value: 6 },
          { key: "c", label: "Walnut riser", value: 0 },
        ]}
        formatters={counts}
        valueLabel="units"
      />,
    );

    const widths = [...document.querySelectorAll("[data-chart-bar]")].map((bar) =>
      Number(/width:\s*([\d.]+)%/.exec(bar.getAttribute("style") ?? "")?.[1]),
    );
    // 58 and 6 against an axis whose top is 60, then nothing: both a fraction of one scale rather
    // than each row sized to itself, and a zero that is drawn as zero.
    expect(widths[0]).toBeCloseTo((58 / 60) * 100, 1);
    expect(widths[1]).toBeCloseTo(10, 5);
    expect(widths[2]).toBe(0);
  });

  it("prints the value and its unit on every row, so a bar can be read without the axis", () => {
    render(
      <AdminRankChart
        ariaLabel="Units"
        items={[{ key: "a", label: "Amber lamp", value: 58 }]}
        formatters={counts}
        valueLabel="units"
      />,
    );

    // The visible row, not the hidden table, which carries the same 58 for a screen reader.
    const row = screen.getByText("Amber lamp", { selector: "span" }).closest("li") as HTMLElement;
    expect(within(row).getByText("58")).toBeInTheDocument();
    expect(within(row).getByText("units")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Units" })).toBeInTheDocument();
  });
});
