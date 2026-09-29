// SPDX-License-Identifier: MIT
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { catalogPreviews } from "../fixtures/app/catalog/previews";
import { componentCatalog } from "../fixtures/lib/demo-catalog";

/**
 * The chart previews, checked on their geometry rather than on the presence of a node.
 *
 * A chart draws SVG, so its correctness is a claim about numbers: a bar's height against the axis
 * it is drawn on, a gridline that is a round number above the data, a day with no rows drawn as a
 * zero. Each of those renders as a plausible-looking picture whether or not it is right, and a
 * preview that only asserted "an svg appeared" would pass on a chart that scaled every series to
 * itself and clipped the tallest bar. So these assert the geometry.
 *
 * The previews are the ones the catalogue page shows, keyed by the export's own name, so a preview
 * that stops drawing what its entry promises fails here and not on a page nobody opens.
 */

type Mark = {
  series: string;
  category: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function preview(name: string) {
  const entry = componentCatalog.find((item) => item.name === name);
  expect(entry?.renderable, `${name} is not marked renderable, so it has no preview to check`).toBe(true);
  const Preview = catalogPreviews[name];
  return { entry: entry!, Preview: Preview! };
}

function draw(name: string) {
  const { Preview } = preview(name);
  return render(<Preview />);
}

function marks(): Mark[] {
  return [...document.querySelectorAll("[data-chart-mark]")].map((mark) => {
    const [series, category] = (mark.getAttribute("data-chart-mark") ?? "").split(":");
    return {
      series: series ?? "",
      category: category ?? "",
      x: Number(mark.getAttribute("x")),
      y: Number(mark.getAttribute("y")),
      width: Number(mark.getAttribute("width")),
      height: Number(mark.getAttribute("height")),
    };
  });
}

function barWidths(): number[] {
  return [...document.querySelectorAll("[data-chart-bar]")].map((bar) =>
    Number(/width:\s*([\d.]+)%/.exec(bar.getAttribute("style") ?? "")?.[1]),
  );
}

describe("the time series preview", () => {
  it("draws one mark per day, including the day the store holds nothing for", () => {
    draw("AdminTimeSeriesChart");

    // Seven days in, seven marks out. The 25th is absent from the totals, so the fill gave it a
    // zero, and a mark at zero height standing on the baseline is what makes the gap legible.
    const drawn = marks();
    expect(drawn).toHaveLength(7);
    const gap = drawn.find((mark) => mark.category === "2026-09-25");
    expect(gap, "the day with no order was not drawn at all").toBeDefined();
    expect(gap!.height).toBe(0);

    // The baseline is the same y for the gap as for the plot floor, which is what "standing on the
    // axis" means. A mark drawn at the top would be a value, and a value of zero at the top of the
    // plot is a different and wrong reading.
    const tallest = drawn.reduce((peak, mark) => (mark.height > peak.height ? mark : peak));
    expect(gap!.y).toBeGreaterThan(tallest.y);
  });

  it("scales the marks against one round axis above the data", () => {
    draw("AdminTimeSeriesChart");

    // $441.50 is the peak, and the top gridline is $600: a multiple of a round step and never below
    // the data. An axis topping out at the peak itself would clip the tallest bar.
    const tickLabels = [...document.querySelectorAll("svg text")].map((node) => node.textContent);
    expect(tickLabels.slice(0, 4)).toEqual(["$0", "$200", "$400", "$600"]);

    // Two bars scaled against that axis: 44150 and 12780 cents, so the ratio of their heights is
    // the ratio of their values and not a per-series normalisation.
    const peak = marks().find((mark) => mark.category === "2026-09-28")!;
    const small = marks().find((mark) => mark.category === "2026-09-29")!;
    expect(peak.height / small.height).toBeCloseTo(44150 / 12780, 2);
  });
});

describe("the ranked preview", () => {
  it("sizes every bar against one axis rather than against its own row", () => {
    draw("AdminRankChart");

    // 58, 31, 12 and 0 against a top of 60. Each bar is a fraction of the same denominator, so a
    // reader can compare two rows and check the comparison against the numbers printed beside them.
    const widths = barWidths();
    expect(widths).toHaveLength(4);
    expect(widths[0]).toBeCloseTo((58 / 60) * 100, 1);
    expect(widths[1]).toBeCloseTo((31 / 60) * 100, 1);
    expect(widths[2]).toBeCloseTo(20, 5);
    expect(widths[3]).toBe(0);

    // And the axis is labelled with the top those fractions are against, at 0, 20, 40 and 60. The
    // axis is the first element inside the figure, before the rows and before the hidden table.
    expect(
      [...document.querySelectorAll("figure > div:first-child > span")].map((node) => node.textContent),
    ).toEqual(["0", "20", "40", "60"]);
  });
});

describe("the table preview", () => {
  it("carries the same numbers as the chart it sits beside", () => {
    const { Preview } = preview("AdminChartTable");
    render(<Preview />);

    // The table this card places, found by its caption. The chart beside it ships a copy of the
    // same rows, so the assertion is scoped: a table that agreed with nothing would be an
    // accessibility path to a number that is not on the page.
    const table = screen.getByRole("table", { name: "Revenue by day, as a table" });
    const byDay = new Map(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => [
          within(row).getByRole("rowheader").textContent ?? "",
          within(row).getByRole("cell").textContent ?? "",
        ]),
    );

    expect([...byDay.keys()]).toEqual(["23", "24", "25", "26", "27", "28", "29"]);
    expect([...byDay.values()]).toEqual([
      "$184.20",
      "$246.50",
      "$0.00",
      "$312.00",
      "$289.90",
      "$441.50",
      "$127.80",
    ]);

    // The same figure as the peak bar. One day, one number, and a table that drifted from the
    // marks would be a screen reader being told something different from what the sighted reader
    // is looking at.
    const peak = marks().find((mark) => mark.category === "2026-09-28");
    expect(peak, "the chart this table mirrors drew no peak mark").toBeDefined();
    expect(byDay.get("28")).toBe("$441.50");

    // The zero day is a row of its own rather than an absent one, so a reader is told the day was
    // empty instead of having to infer it from a row that is not there.
    expect(byDay.get("25")).toBe("$0.00");
  });
});

describe("the frame preview", () => {
  it("draws a different thing in each of the four states, and a chart only in the ready one", () => {
    draw("AdminChartFrame");

    // The labels come from the package's own defaults, which is the point of the card: a host that
    // supplies none still gets four distinct sentences rather than one reused one.
    expect(screen.getByText("Loading chart data")).toBeInTheDocument();
    expect(screen.getByText("No data for this period")).toBeInTheDocument();
    expect(screen.getByText("This chart could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("The orders table did not answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    // One chart's worth of bars out of four frames. The frame is what stops a failed query from
    // arriving as a bar at zero, so a frame that drew its children while loading or after an error
    // would defeat the reason it exists.
    expect(document.querySelectorAll("[data-chart-bar]")).toHaveLength(3);
  });
});
