// SPDX-License-Identifier: MIT
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminChartAxis, adminChartDayRange, adminChartFormatters } from "../src/charts";
import AnalyticsPage from "../fixtures/app/shell/analytics/page";
import { rankByStock, revenueByDay, sumCents, type AnalyticsOrderRow } from "../fixtures/app/shell/analytics/shape";

/**
 * The page and the engine's charts, with the store stood in for.
 *
 * What is under test is the page rather than the arithmetic: that a chart's marks come from rows the
 * boundary returned, that a reader can tell what the numbers are, and that the engine's own states
 * are what a reader gets. The slow action is released by hand so the loading state is measured
 * rather than raced, and the refused action fails with the boundary's own message so the error state
 * is the real one and not a status a fixture wrote.
 *
 * Every expectation is an exact string on a formatted integer. A test that accepted "some dollar
 * figure" would pass just as happily against the hardcoded $12,840 the page used to draw, which is
 * the specific thing being replaced.
 */
const backend = vi.hoisted(() => ({
  revenue: vi.fn(),
  stock: vi.fn(),
  totals: vi.fn(),
}));

vi.mock("../fixtures/app/shell/analytics/data", () => ({
  loadDailyRevenueAction: backend.revenue,
  loadStockByProductAction: backend.stock,
  loadAnalyticsTotalsAction: backend.totals,
}));

const money = adminChartFormatters("money");
const counts = adminChartFormatters("count");

/**
 * The cents on the revenue axis, for a peak of 74000 across the mocked range.
 *
 * Named once so the labels asserted in the test and the values asserted for the axis are the same
 * five numbers, rather than two lists that have to be kept in step by hand.
 */
const AXIS_CENTS = [0, 20000, 40000, 60000, 80000];

/** The engine's own emptiness rules, restated here only to predict what the page will show. */
const revenueChart = () => screen.getByRole("img", { name: /Revenue by day over/ });

function chartCard(name: RegExp | string) {
  return screen.getByRole("heading", { name, level: 2 }).closest("section") as HTMLElement;
}

beforeEach(() => {
  // The width is read off the argument rather than fixed, so a test that changes the range gets a
  // chart of that width back instead of a relabelled 30 days.
  backend.revenue.mockImplementation(async (_end: Date, days: number) => {
    const range = adminChartDayRange(days, new Date("2026-09-29T12:00:00.000Z"));
    return {
      // Three days of the range carry money, the rest are zeros: the shape a real store has, and the
      // shape a fabricated constant series never had.
      cents: 129000,
      days: range.map((key, index) => ({
        key,
        label: `day ${index}`,
        value: index === 0 ? 9900 : index === 10 ? 74000 : index === 20 ? 4500 : 0,
      })),
    };
  });
  backend.stock.mockResolvedValue([
    { key: "prd_5", label: "Linen cable tray", units: 58, cents: 3200 },
    { key: "prd_1", label: "Amber desk lamp", units: 34, cents: 4900 },
  ]);
  backend.totals.mockResolvedValue({
    revenueCents: 129000,
    paidOrders: 4,
    averageOrderCents: 32250,
    catalogValueCents: 466300,
    unitsInStock: 92,
  });
});

describe("the analytics page draws what the store holds", () => {
  it("plots the days the rows land on and none of the others", async () => {
    render(<AnalyticsPage />);

    const marks = await waitFor(() => {
      const found = revenueChart().querySelectorAll("[data-chart-mark]");
      expect(found.length).toBeGreaterThan(0);
      return found;
    });

    // One mark per day in the range. A chart built from the rows alone would have three, and would
    // draw a straight line across the twenty-seven days that hold nothing.
    expect(marks).toHaveLength(30);
    const heights = [...marks].map((mark) => Number(mark.getAttribute("height")));
    // 9900 at index 0, 74000 at 10, 4500 at 20, and nothing anywhere else: a day with no order is a
    // zero-height mark, which is what makes the gap readable rather than interpolated.
    expect(heights.filter((height) => height > 0)).toHaveLength(3);
    // And 30 hit areas behind them, so a day with no money is still hoverable.
    expect(revenueChart().querySelectorAll("[data-chart-hit]")).toHaveLength(30);
  });

  it("keeps every bar inside its own column, so two days cannot be read as one", async () => {
    render(<AnalyticsPage />);
    const svg = await waitFor(() => revenueChart());

    // The two columns that both carry money are ten days apart. If a bar were wider than its column
    // the marks would run together and the peak would be read as covering the days around it, which
    // is the one mistake a bar chart makes that a reader cannot detect on their own.
    const byDay = new Map(
      [...svg.querySelectorAll("[data-chart-mark]")].map((mark) => [
        mark.getAttribute("data-chart-mark")!.split(":")[1],
        {
          x: Number(mark.getAttribute("x")),
          width: Number(mark.getAttribute("width")),
        },
      ]),
    );
    const keys = [...byDay.keys()];
    const band = Number(svg.querySelector("[data-chart-hit]")?.getAttribute("width"));
    expect(band).toBeGreaterThan(0);

    for (const key of keys) {
      const mark = byDay.get(key)!;
      expect(mark.width).toBeLessThanOrEqual(band);
    }
    // Sorted by position, no bar may reach into the column after it.
    const positions = keys
      .map((key) => ({ key, ...byDay.get(key)! }))
      .sort((left, right) => left.x - right.x);
    for (let index = 1; index < positions.length; index += 1) {
      const previous = positions[index - 1];
      const current = positions[index];
      expect(previous.x + previous.width, `${previous.key} runs into ${current.key}`).toBeLessThanOrEqual(
        current.x,
      );
    }
  });

  it("scales every bar against one axis that is above the data and round", async () => {
    render(<AnalyticsPage />);
    const svg = await waitFor(() => revenueChart());

    // The axis values, in cents, that the peak of 74000 implies: five gridlines at an even step of
    // 20000, the top one round and strictly above the data. Asserted on the values, not on the text
    // they print as, because the values are the property and the text is one runtime's rendering of
    // them.
    expect(adminChartAxis(74000, { ticks: 4, integer: true }).ticks).toEqual(AXIS_CENTS);

    const labels = [...svg.querySelectorAll("text")].map((node) => node.textContent);
    // The exact sequence, still pinned, but derived from the formatter the chart itself draws with
    // rather than written out. `Intl` renders a whole compact currency value as "$800" on some
    // runtimes and "$800.0" on others, so a literal here passed on one machine and failed on another
    // while saying nothing about the chart. This says the axis prints the formatter's own rendering
    // of the five values above, in order, which is the property that actually matters and which
    // holds on every runtime.
    const moneyLabels = labels.filter((label) => label?.startsWith("$"));
    expect(moneyLabels).toEqual(AXIS_CENTS.map((cents) => money.tick(cents)));
    expect(moneyLabels).toHaveLength(5);

    // Even steps, from zero, and the peak strictly inside: a rescaled axis would put the tallest
    // mark flush with the top gridline and the axis would be decoration rather than a scale.
    const tallest = Math.max(
      ...[...svg.querySelectorAll("[data-chart-mark]")].map((mark) =>
        Number(mark.getAttribute("height")),
      ),
    );
    const [, , , boxHeight] = (svg.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
    const plotHeight = boxHeight - 36;
    expect(tallest).toBeGreaterThan(0);
    expect(tallest).toBeLessThan(plotHeight);
    expect(tallest / plotHeight).toBeCloseTo(74000 / 80000, 3);
  });

  it("names the unit and prints the total, so the axis is readable without hovering", async () => {
    render(<AnalyticsPage />);
    await waitFor(() => expect(revenueChart()).toBeInTheDocument());

    // The accessible name is the summary a screen reader gets, and it carries the exact total.
    expect(revenueChart().getAttribute("aria-label")).toBe(
      "Revenue by day over 30 days, totalling $1,290.00",
    );
    expect(screen.getByText("$1,290.00")).toBeInTheDocument();
  });

  it("formats money from integer cents rather than adding up formatted strings", () => {
    // The arithmetic the page's numbers depend on, checked on its own so a formatting change cannot
    // quietly move it. 0.1 + 0.2 drift is the shape of the bug: a total assembled from strings
    // disagrees with the ledger while looking correct.
    const orders: AnalyticsOrderRow[] = [
      { id: "a", total_cents: 9900, status: "paid", created_at: "2026-09-01 10:00:00" },
      { id: "b", total_cents: 74900, status: "shipped", created_at: "2026-09-02 10:00:00" },
      { id: "c", total_cents: 5900, status: "cancelled", created_at: "2026-09-02 11:00:00" },
    ];
    // A cancelled order is money nobody took, so it is not in the sum at all.
    expect(sumCents(orders.filter((order) => order.status !== "cancelled"))).toBe(84800);
    expect(money.value(sumCents(orders.filter((order) => order.status !== "cancelled")))).toBe("$848.00");

    // 70.1 + 20.2 + 10.7 in dollars is 101.00, and adding the strings gives 101.00 too, so the
    // distinguishing case is the one where a per-order rounding would differ from the total.
    const awkward: AnalyticsOrderRow[] = [
      { id: "d", total_cents: 335, status: "paid", created_at: "2026-09-01 10:00:00" },
      { id: "e", total_cents: 335, status: "paid", created_at: "2026-09-01 11:00:00" },
    ];
    expect(money.value(sumCents(awkward))).toBe("$6.70");
  });

  it("buckets cents by the day on the row, and drops a row that is not a timestamp", () => {
    const orders: AnalyticsOrderRow[] = [
      { id: "a", total_cents: 4900, status: "paid", created_at: "2026-09-28 09:00:00" },
      { id: "b", total_cents: 3200, status: "paid", created_at: "2026-09-28T23:59:00.000Z" },
      { id: "c", total_cents: 12500, status: "paid", created_at: "2026-09-29 01:00:00" },
      { id: "d", total_cents: 99999, status: "paid", created_at: "not a date" },
    ];
    const totals = revenueByDay(orders);

    // The two shapes the store produces are the same day, and the unparseable row is not counted
    // anywhere rather than landing in a bucket that never appears on the axis.
    expect(totals.get("2026-09-28")).toBe(8100);
    expect(totals.get("2026-09-29")).toBe(12500);
    expect([...totals.values()].reduce((total, value) => total + value, 0)).toBe(20600);
  });

  it("ranks the products the rows describe, largest first, and prints each value", async () => {
    render(<AnalyticsPage />);
    const card = await waitFor(() => chartCard("Units in stock by product"));

    // The label appears twice on purpose: once as the visible row and once in the hidden table, so a
    // screen reader reaches the same number the bar is drawn from. The row is the one carrying the
    // bar.
    const row = within(card).getByText("Linen cable tray", { selector: "span.truncate" });
    expect(row).toBeInTheDocument();
    expect(within(card).getByText("Amber desk lamp", { selector: "span.truncate" })).toBeInTheDocument();
    expect(within(card).getByText("58", { selector: "span" })).toBeInTheDocument();
    expect(within(card).getByText("34", { selector: "span" })).toBeInTheDocument();
    // The unit rides on every row rather than once in a heading, so a row read on its own still says
    // what it counts.
    expect(within(card).getAllByText("units", { selector: "span" })).toHaveLength(2);
    // The axis names the top of the scale in whole units, so 58 is read against 60 rather than
    // against nothing.
    expect(within(card).getByText(counts.tick(60))).toBeInTheDocument();
  });

  it("breaks a tie in stock on the name, so the ranking does not shuffle between loads", () => {
    const rows = [
      { id: "b", name: "Zebra lamp", sku: "Z", stock: 10, price_cents: 100 },
      { id: "a", name: "Amber lamp", sku: "A", stock: 10, price_cents: 100 },
    ];
    // Same input, and the same order out. A sort with no tiebreak leaves this to the engine's sort,
    // which is stable, so the names decide and the chart does not move under the reader.
    expect(rankByStock(rows, 10).map((row) => row.label)).toEqual([
      "Amber lamp",
      "Zebra lamp",
    ]);
  });
});

describe("the chart is in the engine's state, not a costume", () => {
  it("is loading until the action answers, and shows no mark meanwhile", async () => {
    let release!: (value: unknown) => void;
    backend.revenue.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<AnalyticsPage />);

    const card = screen.getByRole("heading", { name: "Revenue by day", level: 2 }).closest("section")!;
    expect(within(card).getByText("Loading chart data")).toBeInTheDocument();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
    // The other chart, whose load was not held up, is already showing its data.
    expect(await screen.findByRole("img", { name: "Units in stock by product" })).toBeInTheDocument();

    release({ cents: 1000, days: adminChartDayRange(30, new Date()).map((key) => ({ key, label: key, value: 0 })) });
  });

  it("shows the boundary's own refusal as an error, and retries it on the chart's control", async () => {
    const user = userEvent.setup();
    backend.revenue.mockRejectedValue(new Error("This session may not read orders"));
    render(<AnalyticsPage />);

    const card = await waitFor(() => {
      const found = screen.getByRole("heading", { name: "Revenue by day", level: 2 }).closest("section")!;
      expect(within(found).getByText("This session may not read orders")).toBeInTheDocument();
      return found;
    });

    expect(within(card).getByText("This chart could not be loaded")).toBeInTheDocument();
    // A failed load must not read as an empty one, which is how a refusal ends up reported as
    // "no revenue in this period".
    expect(within(card).queryByText("No revenue in this range")).not.toBeInTheDocument();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(backend.revenue.mock.calls.length).toBeGreaterThan(1));
  });

  it("reaches its empty state when the rows are all zeros, without a host writing it", async () => {
    // A store with no orders in the window and an empty catalog: the rows really are nothing, and
    // nothing here tells the page that. The zeros come out of the shape, not a flag.
    backend.revenue.mockImplementation(async (_end: Date, days: number) => ({
      cents: 0,
      days: adminChartDayRange(days, new Date()).map((key) => ({ key, label: key, value: 0 })),
    }));
    backend.stock.mockResolvedValue([]);
    backend.totals.mockResolvedValue({
      revenueCents: 0,
      paidOrders: 0,
      averageOrderCents: 0,
      catalogValueCents: 0,
      unitsInStock: 0,
    });
    render(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText("No revenue in this range")).toBeInTheDocument());
    expect(screen.getByText("Nothing in the catalog")).toBeInTheDocument();
    // No mark and no axis in either case, because a chart of nothing is not a chart.
    expect(screen.queryByRole("img", { name: /Revenue by day over/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Units in stock by product" })).not.toBeInTheDocument();
  });

  it("re-reads the store when the range changes, and reports the width it was asked for", async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);
    await waitFor(() => expect(revenueChart()).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Date range"), "7");

    // The loader is rebuilt for the new width, so the action is called again with 7 rather than the
    // chart relabelling the same 30 days.
    await waitFor(() => expect(backend.revenue).toHaveBeenCalledWith(expect.any(Date), 7));
    const svg = await waitFor(() => revenueChart());
    expect(svg.getAttribute("aria-label")).toMatch(/over 7 days/);
  });
});

describe("what a reader can tell from the page without a mouse", () => {
  it("carries every plotted value in a table a screen reader can reach", async () => {
    const { container } = render(<AnalyticsPage />);
    await waitFor(() => expect(revenueChart()).toBeInTheDocument());

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    // 30 rows of 30 days, and the value formatted from the integer the row carried.
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(30);
    expect(table?.textContent).toContain("day 10");
    expect(table?.textContent).toContain("$740.00");
    expect(table?.textContent).toContain("$99.00");
  });

  it("labels the days on the axis rather than printing 30 of them on top of each other", async () => {
    render(<AnalyticsPage />);
    const svg = await waitFor(() => revenueChart());

    // Seven labels chosen from thirty, first and last among them. Thirty labels would overlap into a
    // smear, and dropping them silently would suggest missing data.
    const dayLabels = [...svg.querySelectorAll("text")].filter((node) => node.textContent?.startsWith("day "));
    expect(dayLabels.length).toBeLessThanOrEqual(7);
    expect(dayLabels[0].textContent).toBe("day 0");
    expect(dayLabels[dayLabels.length - 1].textContent).toBe("day 29");
  });
});
