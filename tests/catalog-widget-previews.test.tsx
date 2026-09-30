// SPDX-License-Identifier: MIT
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { componentCatalog } from "../fixtures/lib/demo-catalog";

/**
 * The six tiles are the exports a host registers rather than renders, so the page's existing
 * guarantee does not reach them: it checks that everything the catalogue calls renderable has a
 * preview, and it renders whatever previews exist. Both directions pass on a set of zero.
 *
 * This file is the check that the set is not zero, and that what each card draws is the decision the
 * tile makes rather than a wrapper around it. A preview that renders the same markup for every tile
 * would satisfy the count and nothing else, so each one is asked for the thing only that tile can do.
 */

/** Renders one catalogue preview the way the page does, in the surface the page puts it in. */
async function card(name: string) {
  const { catalogPreviews } = await import("../fixtures/app/catalog/previews");
  const Preview = catalogPreviews[name];
  if (!Preview) throw new Error(`no preview is registered for ${name}`);
  return render(<Preview />);
}

const TILES = [
  "adminStatWidget",
  "adminTableWidget",
  "adminListWidget",
  "adminChartWidget",
  "adminRankWidget",
  "adminActivityWidget",
];

describe("the six tiles on the catalogue page", () => {
  it("shows all six, so the page offers the whole library rather than the parts that were easy", () => {
    for (const name of TILES) {
      expect(componentCatalog.find((entry) => entry.name === name)?.renderable, `${name} has no preview on the page`).toBe(true);
    }
  });

  it("gives a table a preview that right-aligns its numbers, which is the decision it makes", async () => {
    await card("adminTableWidget");
    // The header and the cell below it share an alignment, and the alignment is the one the tile
    // worked out from the data. A preview handing the table an explicit `align` would draw the same
    // markup as a table that decided nothing, and this assertion would still pass, so the caption
    // is checked too: it names what is on screen.
    const money = screen.getByRole("columnheader", { name: "Revenue" });
    // The header and the first body cell, found through the table rather than through each other:
    // a `th` and a `td` are never siblings, they are in different sections of the same table.
    const firstCell = screen.getByRole("table").querySelector("tbody td:last-child")!;
    expect(money).toHaveClass("text-right");
    expect(firstCell).toHaveClass("text-right");
    expect(firstCell.textContent).toMatch(/^\$[\d,]+\.\d\d$/);
  });

  it("says what a capped table left out, rather than drawing a partial list as the whole one", async () => {
    await card("adminTableWidget");
    // Five products, capped at three. The cap is a judgement the tile makes, so its note is the
    // evidence of it, and without the note this card would look identical to an uncapped one.
    expect(screen.getByText(/Showing 3 of 5/)).toBeInTheDocument();
  });

  it("shows a stat coloured by its own trend, and a second one where the same rise reads badly", async () => {
    await card("adminStatWidget");
    const rising = screen.getByText("Revenue, 30 days").closest("section")!;
    const refunds = screen.getByText("Refunds, 30 days").closest("section")!;
    // Both trends are rises and both are drawn, so the colour is the only thing that can differ, and
    // it differs because one declared `invertTrend`. Asserting on the text colour class rather than
    // the computed style keeps this readable in jsdom, which does not resolve Tailwind.
    const tone = (tile: Element) =>
      tile.querySelector("[data-stat-trend]")?.className.match(/text-(emerald|red)-\d+/)?.[0];
    expect(tone(rising)).toBe("text-emerald-700");
    expect(tone(refunds)).toBe("text-red-700");
  });

  it("truncates a long label in a list while keeping its full text reachable", async () => {
    await card("adminListWidget");
    // The product name is the longest string in the sample, so the card is the case the tile exists
    // for. The title is what a touch screen has instead of a hover.
    const label = screen.getByText("Espresso machine");
    expect(label).toHaveClass("truncate");
    expect(label).toHaveAttribute("title", "Espresso machine");
  });

  it("plots a chart on the package's own chart, with the caption that names it for a screen reader", async () => {
    await card("adminChartWidget");
    // A host drawing this itself is the case the tile prevents: the accessible name is the sentence
    // a reader gets instead of the drawing, and it is an option rather than a derivation.
    expect(screen.getByRole("img", { name: "Revenue by day" })).toBeInTheDocument();
  });

  it("draws a ranking on the rank chart, which is not a time series with the rows in date order", async () => {
    await card("adminRankWidget");
    expect(screen.getByRole("img", { name: "Units in stock by product" })).toBeInTheDocument();
    // A row per item with the value printed beside its bar, which is the shape a rank chart has and
    // a series does not. Counted rather than matched, because the unit is repeated on every row and
    // one match would pass on a chart that labelled only its first row.
    const table = screen.getByRole("table");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(screen.getAllByText("units").length).toBe(4);
  });

  it("shows ages a feed wrote itself, at more than one of the thresholds it owns", async () => {
    await card("adminActivityWidget");
    // All five branches, so a card that showed one age for every row would be missing four of them.
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("3 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("5 hours ago")).toBeInTheDocument();
    expect(screen.getByText("2 days ago")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
