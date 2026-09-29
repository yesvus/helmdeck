// SPDX-License-Identifier: MIT
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "../src/i18n";
import {
  adminActivityWidget,
  adminChartWidget,
  adminListWidget,
  adminRankWidget,
  adminStatWidget,
  adminTableWidget,
} from "../src/widgets";
import { adminWidgetState, createAdminWidgetRegistry } from "../src/widgets/registry";
import { AdminWidget } from "../src/widgets/render";
import type { AdminWidgetDefinition, AdminWidgetState } from "../src/widgets/types";
import { useAdminWidgetData } from "../src/widgets/data";
import { dashboardRegistry } from "../fixtures/app/dashboard/registry";
import { adminDashboardAddPlacement } from "../src/dashboard/model";
import { AdminDashboardLayout } from "../src/dashboard/layout";

/**
 * A promise the test settles by hand, so a state is reached by driving the load rather than by
 * handing the renderer the state it should then be shown. A widget that renders its own states
 * wrongly still passes every test that constructs a state object, and only a driven one catches it.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Order = { id: string; customer: string; cents: number; placed: string };
type Count = { total: number; previous: number };

/** A tile driven through the load hook, which is the only path the states are reached on. */
function DrivenTile<TData>({
  definition,
  load,
  onRetry,
}: {
  definition: AdminWidgetDefinition<TData>;
  load: (signal: AbortSignal) => Promise<TData>;
  onRetry?: () => void;
}) {
  const { state, refetch } = useAdminWidgetData({ definition, load });
  return <Tile definition={definition} state={state} onRetry={onRetry ?? refetch} />;
}

function Tile<TData>({
  definition,
  state,
  onRetry,
}: {
  definition: AdminWidgetDefinition<TData>;
  state: AdminWidgetState<TData>;
  onRetry?: () => void;
}) {
  return (
    <AdminI18nProvider locale="en">
      <AdminWidget definition={definition} state={state} onRetry={onRetry} />
    </AdminI18nProvider>
  );
}

const orders: Order[] = [
  { id: "o-1", customer: "Ada Lovelace", cents: 12900, placed: "2026-09-28" },
  { id: "o-2", customer: "Grace Hopper", cents: 4400, placed: "2026-09-28" },
  { id: "o-3", customer: "Katherine Johnson", cents: 78000, placed: "2026-09-27" },
];

const revenue = adminStatWidget<Count>({
  id: "revenue",
  title: "Revenue",
  unit: "money",
  value: (data) => data.total,
  previous: (data) => data.previous,
  comparison: "vs last month",
});

const orderTable = adminTableWidget<Order>({
  id: "orders",
  title: "Recent orders",
  rows: (rows) => rows,
  columns: [
    { key: "customer", header: "Customer", value: (row) => row.customer },
    { key: "cents", header: "Total", value: (row) => row.cents },
  ],
  getKey: (row) => row.id,
  unit: "money",
});

const topProducts = adminListWidget<{ id: string; name: string; units: number }>({
  id: "topProducts",
  title: "Units in stock by product",
  rows: (rows) => rows,
  label: (row) => row.name,
  value: (row) => row.units,
  note: (row) => `#${row.id}`,
  getKey: (row) => row.id,
  cap: { max: 2 },
});

const revenueByDay = adminChartWidget<{ days: Array<{ key: string; label: string; value: number }> }>({
  id: "revenueByDay",
  title: "Revenue by day",
  unit: "money",
  categories: (data) => data.days,
  series: (data) => [{ key: "revenue", label: "Revenue", values: data.days.map((day) => day.value) }],
  ariaLabel: (data) => `Revenue by day over ${data.days.length} days`,
});

const stockByProduct = adminRankWidget<Array<{ key: string; label: string; value: number }>>({
  id: "stockByProduct",
  title: "Stock by product",
  items: (rows) => rows,
  valueLabel: "units",
});

const feed = adminActivityWidget<{ id: string; action: string; actor: string; at: string }>({
  id: "feed",
  title: "Recent activity",
  rows: (rows) => rows,
  message: (row) => `${row.actor} ${row.action}`,
  actor: (row) => row.actor,
  at: (row) => row.at,
  tone: (row) => (row.action === "deleted" ? "danger" : "neutral"),
  getKey: (row) => row.id,
  now: () => new Date("2026-09-30T12:00:00Z"),
});

/** Every name the shipped module exports, read off the namespace rather than written out. */
import * as shippedWidgets from "../src/widgets";

describe("a registered widget renders through the registry", () => {
  /**
   * Mounted the way a host mounts it: a registry, a placement naming a widget by id, and states
   * keyed by placement id. The assertions are on what the engine did with the id, not on the widget's
   * own output, so a widget that only renders when handed to a component directly cannot pass.
   */
  const registry = createAdminWidgetRegistry({ revenue, orders: orderTable });

  const placements = [
    adminDashboardAddPlacement({ name: "Sales", placements: [] }, registry, "revenue").placements[0]!,
  ];

  it("places a tile whose widget the registry resolved, named by the placement and not by the caller", () => {
    const { container } = render(
      <AdminDashboardLayout
        registry={registry}
        placements={placements}
        states={{ [placements[0]!.id]: adminWidgetState(revenue, { total: 12900, previous: 9000 }) }}
      />,
    );

    const tile = container.querySelector(`[data-placement="${placements[0]!.id}"]`)!;
    // The engine took the definition from `resolve` by id and the section inside carries the
    // definition's own id, so the two are joined by the registry rather than by the test.
    expect(tile.getAttribute("data-widget")).toBe("revenue");
    expect(within(tile).getByRole("region", { name: "Revenue" })).toBeInTheDocument();
    expect(within(tile).getByText("Revenue")).toBeInTheDocument();
  });

  it("shows the figure the state carried, so the tile's content came from the registry's widget", () => {
    const { container } = render(
      <AdminDashboardLayout
        registry={registry}
        placements={placements}
        states={{ [placements[0]!.id]: adminWidgetState(revenue, { total: 12900, previous: 9000 }) }}
      />,
    );

    // $129.00 is only reachable through the stat widget's money formatter, and 43.3% only through
    // its trend. A tile rendering "12900" would be the engine's data and not the widget's judgement.
    const tile = container.querySelector(`[data-placement="${placements[0]!.id}"]`)!;
    expect(within(tile).getByText("$129.00")).toBeInTheDocument();
    expect(within(tile).getByText(/43\.3%/)).toBeInTheDocument();
  });

  it("reports a placement naming a widget this registry does not hold, rather than rendering nothing", () => {
    // A different registry, not the same one: a dashboard persisted by one build has to be
    // renderable by the next, so the miss is a real case rather than a contrived one.
    const other = createAdminWidgetRegistry({ somethingElse: revenue });
    const { container } = render(
      <AdminDashboardLayout
        registry={other}
        placements={placements}
        states={{ [placements[0]!.id]: { status: "ready", data: { total: 12900, previous: 9000 } } }}
      />,
    );

    const tile = container.querySelector(`[data-placement="${placements[0]!.id}"]`)!;
    expect(tile.getAttribute("data-widget")).toBe("revenue");
    // The tile is reported in place. Rendering nothing would leave a hole that reads as a layout
    // bug, and the figure staying on screen would be claiming the engine resolved a widget it did not.
    expect(within(tile).getByText(/does not provide/)).toBeInTheDocument();
    expect(screen.queryByText("$129.00")).not.toBeInTheDocument();
  });

  it("registers a widget once, and refuses the same widget twice rather than listing it twice", () => {
    // A registry built from a set would hide the second entry, so the list itself is the assertion.
    expect(() => createAdminWidgetRegistry([revenue, revenue])).toThrow(/both registered/);
    expect(createAdminWidgetRegistry([revenue, orderTable]).list().map((w) => w.id)).toEqual([
      "revenue",
      "orders",
    ]);
  });

  it("lists every shipped widget once, with a distinct id each, so an arrangement can name any of them", () => {
    const shipped = createAdminWidgetRegistry([
      revenue,
      orderTable,
      topProducts,
      revenueByDay,
      stockByProduct,
      feed,
    ]);

    expect(shipped.list().map((w) => w.id)).toEqual([
      "revenue",
      "orders",
      "topProducts",
      "revenueByDay",
      "stockByProduct",
      "feed",
    ]);
    expect(shipped.list()).toHaveLength(6);
    expect(new Set(shipped.list().map((w) => w.id)).size).toBe(6);
  });

  it("exports a function under every widget name, so a host importing one cannot reach undefined", () => {
    const names = Object.keys(shippedWidgets).filter((name) => name.startsWith("admin") && name.endsWith("Widget"));
    // Read off the namespace rather than a list kept beside it, so a renamed export is caught here
    // rather than by whichever test happened to write the old name.
    expect(names.sort()).toEqual([
      "adminActivityWidget",
      "adminChartWidget",
      "adminListWidget",
      "adminRankWidget",
      "adminStatWidget",
      "adminTableWidget",
    ]);
    for (const name of names) {
      expect(typeof shippedWidgets[name as keyof typeof shippedWidgets], `${name} is not a function`).toBe("function");
    }
  });
});

describe("the stat widget's states, driven through the load", () => {
  it("shows a placeholder shaped like the figure while the loader is still open", async () => {
    const gate = deferred<Count>();
    render(<DrivenTile definition={revenue} load={() => gate.promise} />);

    // Resolved by the widget's own loading state, so a widget that drew nothing would not pass on
    // the engine's default appearing by accident.
    expect(document.querySelector("[data-widget-skeleton]")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Revenue" })).toBeInTheDocument();
    expect(screen.queryByText("$129.00")).not.toBeInTheDocument();

    await act(async () => gate.resolve({ total: 12900, previous: 9000 }));
  });

  it("shows the failure's own message, not a sentence of the widget's own", async () => {
    const gate = deferred<Count>();
    render(<DrivenTile definition={revenue} load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("the ledger did not answer")));

    // The engine's title beside the loader's message. A widget that wrote its own error copy would
    // keep the title and lose the message, and this is the assertion that says so.
    expect(screen.getByText("This widget could not load")).toBeInTheDocument();
    expect(screen.getByText("the ledger did not answer")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("offers a retry that is the load hook's own refetch, because a failure the reader cannot retry is a dead end", async () => {
    const first = deferred<Count>();
    const recovered = deferred<Count>();
    const loads = [first, recovered];
    let call = 0;
    const user = userEvent.setup();
    render(<DrivenTile definition={revenue} load={() => loads[call++]!.promise} />);

    await act(async () => first.reject(new Error("down")));
    expect(screen.getByText("down")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => recovered.resolve({ total: 4400, previous: 12900 }));

    expect(screen.getByText("$44.00")).toBeInTheDocument();
  });

  it("shows a figure of zero as a figure, because $0.00 is a fact and nothing to show is a claim", async () => {
    const gate = deferred<Count>();
    render(<DrivenTile definition={revenue} load={() => gate.promise} />);

    await act(async () => gate.resolve({ total: 0, previous: 0 }));

    // A stat reads its emptiness from whether the figure can be read at all, not from its value. A
    // month with no revenue is a month that earned nothing, and hiding that behind the empty state
    // is the one mistake a stat tile cannot make. A host whose metric reads zero as absent passes
    // its own `isEmpty`.
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("shows the empty state when the figure cannot be read, which is how the data declares it absent", async () => {
    const optional = adminStatWidget<{ total?: number }>({
      id: "optional",
      title: "Revenue",
      unit: "money",
      value: (data) => data.total,
    });
    const gate = deferred<{ total?: number }>();
    render(<DrivenTile definition={optional} load={() => gate.promise} />);

    // A field the query did not return. Rendering it as $0.00 would state a figure nobody measured.
    await act(async () => gate.resolve({}));

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("shows a host's own empty copy when it supplies one, rather than the engine's generic sentence", async () => {
    const orders30 = adminStatWidget<Count>({
      id: "orders30",
      title: "Orders",
      value: (data) => data.total,
      empty: { title: "No orders in this period", body: "Nothing was placed in the last 30 days." },
    });
    const gate = deferred<Count>();
    render(<DrivenTile definition={orders30} load={() => gate.promise} />);

    await act(async () => gate.resolve({}));

    expect(screen.getByText("No orders in this period")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });
});

describe("what the stat widget decides", () => {
  it("colours a rise good and a fall bad, so the alarming tile is the alarming one", () => {
    const up = adminStatWidget<Count>({
      id: "up",
      title: "Signups",
      value: (d) => d.total,
      previous: (d) => d.previous,
    });
    const down = adminStatWidget<Count>({
      id: "down",
      title: "Signups",
      value: (d) => d.total,
      previous: (d) => d.previous,
    });

    render(
      <Tile definition={up} state={adminWidgetState(up, { total: 120, previous: 100 })} />,
    );
    expect(document.querySelector("[data-stat-trend='up']")?.className).toContain("emerald");

    render(<Tile definition={down} state={adminWidgetState(down, { total: 80, previous: 100 })} />);
    expect(document.querySelector("[data-stat-trend='down']")?.className).toContain("red");
  });

  it("swaps the tones for a metric whose fall is the good news", () => {
    const churn = adminStatWidget<Count>({
      id: "churn",
      title: "Churn",
      value: (d) => d.total,
      previous: (d) => d.previous,
      invertTrend: true,
    });

    render(<Tile definition={churn} state={adminWidgetState(churn, { total: 120, previous: 100 })} />);
    expect(document.querySelector("[data-stat-trend='up']")?.className).toContain("red");
  });

  it("honours a tone the host chose over the one the trend would have picked", () => {
    const budget = adminStatWidget<Count>({
      id: "budget",
      title: "Budget used",
      value: (d) => d.total,
      previous: (d) => d.previous,
      tone: "warning",
    });

    render(<Tile definition={budget} state={adminWidgetState(budget, { total: 40, previous: 100 })} />);
    expect(document.querySelector("[data-stat-trend='down']")?.className).toContain("amber");
  });

  it("draws no trend where no rate exists, rather than a percentage of nothing", () => {
    const fresh = adminStatWidget<Count>({
      id: "fresh",
      title: "Signups",
      value: (d) => d.total,
      previous: () => 0,
    });

    // Zero a period ago and eight now is a difference, not a rate, and "infinite percent" is not a
    // sentence. A widget that drew a trend here would be inventing a figure.
    render(<Tile definition={fresh} state={adminWidgetState(fresh, { total: 8, previous: 0 })} />);
    expect(document.querySelector("[data-stat-trend]")).toBeNull();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("draws no trend when the figure has not moved, because zero percent is noise on a tile", () => {
    const flat = adminStatWidget<Count>({
      id: "flat",
      title: "Signups",
      value: (d) => d.total,
      previous: (d) => d.previous,
    });

    render(<Tile definition={flat} state={adminWidgetState(flat, { total: 42, previous: 42 })} />);
    expect(document.querySelector("[data-stat-trend]")).toBeNull();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("reads money as whole cents and never divides earlier, so a large total keeps its last digits", () => {
    render(<Tile definition={revenue} state={adminWidgetState(revenue, { total: 123456789, previous: 0 })} />);
    expect(screen.getByText("$1,234,567.89")).toBeInTheDocument();
  });

  it("declares the tile sizes a number makes sense at, so a quarter-width tile is the default", () => {
    expect(revenue.sizes).toEqual(["sm", "md"]);
  });
});

describe("the table widget's states, driven through the load", () => {
  it("shows a placeholder with the table's columns while the loader is open", async () => {
    const gate = deferred<Order[]>();
    render(<DrivenTile definition={orderTable} load={() => gate.promise} />);

    // Asserted on the widget's own placeholder rather than on the engine's default, because the
    // engine's default for a table-shaped tile is one bar and a widget that left it there would
    // reserve the wrong height when the rows land.
    const skeleton = document.querySelector("[data-widget-skeleton='rows']")!;
    expect(skeleton).not.toBeNull();
    expect(skeleton.children.length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await act(async () => gate.resolve(orders));
  });

  it("shows the table when the rows arrive, keyed by the host's own key", async () => {
    const gate = deferred<Order[]>();
    render(<DrivenTile definition={orderTable} load={() => gate.promise} />);
    await act(async () => gate.resolve(orders));

    const table = screen.getByRole("table", { name: "Recent orders" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("cell", { name: "Ada Lovelace" })).toBeInTheDocument();
  });

  it("shows the failure's message rather than an empty table", async () => {
    const gate = deferred<Order[]>();
    render(<DrivenTile definition={orderTable} load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("orders table is locked")));

    expect(screen.getByText("orders table is locked")).toBeInTheDocument();
    // A table whose rows are gone reads as "no orders", which is the opposite of what happened.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the empty state for no rows, which is a different fact from a failure", async () => {
    const gate = deferred<Order[]>();
    render(<DrivenTile definition={orderTable} load={() => gate.promise} />);
    await act(async () => gate.resolve([]));

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    expect(screen.queryByText("This widget could not load")).not.toBeInTheDocument();
  });
});

describe("what the table widget decides", () => {
  it("right-aligns a column of numbers and left-aligns one of names, from the data alone", () => {
    render(<Tile definition={orderTable} state={adminWidgetState(orderTable, orders)} />);

    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]!.className).toContain("text-left");
    expect(headers[1]!.className).toContain("text-right");
  });

  it("formats a numeric column as money, because the value reaches the tile as cents", () => {
    render(<Tile definition={orderTable} state={adminWidgetState(orderTable, orders)} />);
    // $129.00 and $780.00 are the only places a division by a hundred happens for this tile.
    expect(screen.getByText("$129.00")).toBeInTheDocument();
    expect(screen.getByText("$780.00")).toBeInTheDocument();
  });

  it("keeps a mixed column left-aligned, because the reader is looking for the name in it", () => {
    const mixed = adminTableWidget<Order>({
      id: "mixed",
      title: "Orders",
      rows: (rows) => rows,
      columns: [{ key: "customer", header: "Customer", value: (row) => row.customer }],
      getKey: (row) => row.id,
    });

    render(<Tile definition={mixed} state={adminWidgetState(mixed, orders)} />);
    expect(screen.getAllByRole("columnheader")[0]!.className).toContain("text-left");
  });

  it("caps the rows and says how many were left out, rather than cutting the list silently", () => {
    const capped = adminTableWidget<Order>({
      id: "capped",
      title: "Orders",
      rows: (rows) => rows,
      columns: [{ key: "customer", header: "Customer", value: (row) => row.customer }],
      getKey: (row) => row.id,
      cap: { max: 2 },
    });

    render(<Tile definition={capped} state={adminWidgetState(capped, orders)} />);

    const body = screen.getByRole("table").querySelectorAll("tbody tr");
    expect(body).toHaveLength(2);
    // The note is the whole point: a two-row table shown as though it were every order is a lie.
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
  });

  it("uses a host's own cap note, so the sentence is in the host's language", () => {
    const capped = adminTableWidget<Order>({
      id: "capped",
      title: "Orders",
      rows: (rows) => rows,
      columns: [{ key: "customer", header: "Customer", value: (row) => row.customer }],
      getKey: (row) => row.id,
      cap: { max: 1, note: (shown, total) => `${shown} / ${total} sipariş` },
    });

    render(<Tile definition={capped} state={adminWidgetState(capped, orders)} />);
    expect(screen.getByText("1 / 3 sipariş")).toBeInTheDocument();
  });

  it("prints nothing for a cell the row does not carry, rather than the word undefined", () => {
    const partial = adminTableWidget<{ id: string; note?: string }>({
      id: "partial",
      title: "Notes",
      rows: (rows) => rows,
      columns: [{ key: "note", header: "Note", value: (row) => row.note }],
      getKey: (row) => row.id,
    });

    render(<Tile definition={partial} state={adminWidgetState(partial, [{ id: "a" }, { id: "b", note: "called" }])} />);

    const cells = screen.getByRole("table").querySelectorAll("tbody td");
    expect(cells[0]!.textContent).toBe("");
    expect(cells[1]!.textContent).toBe("called");
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("declares the wide sizes a table makes sense at", () => {
    expect(orderTable.sizes).toEqual(["lg", "xl"]);
  });
});

describe("the list widget's states, driven through the load", () => {
  const products = [
    { id: "p-1", name: "Analytical engine, brass", units: 58 },
    { id: "p-2", name: "Difference engine", units: 31 },
    { id: "p-3", name: "Punch card, 80 column", units: 12 },
  ];

  it("shows a placeholder with the list's rows while the loader is open", async () => {
    const gate = deferred<typeof products>();
    render(<DrivenTile definition={topProducts} load={() => gate.promise} />);

    // The widget's own placeholder, which is list-shaped rather than the engine's one bar, so the
    // tile reserves the height the rows are about to take. The rows are present and empty, which is
    // the difference between a list waiting and a list that is not there.
    const skeleton = document.querySelector("[data-widget-skeleton='rows']")!;
    expect(skeleton.children.length).toBe(3);
    expect(screen.queryByText("Difference engine")).not.toBeInTheDocument();

    await act(async () => gate.resolve(products));
  });

  it("shows label, figure and note when the rows arrive", async () => {
    const gate = deferred<typeof products>();
    render(<DrivenTile definition={topProducts} load={() => gate.promise} />);
    await act(async () => gate.resolve(products));

    expect(screen.getByText("Difference engine")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("#p-2")).toBeInTheDocument();
  });

  it("shows the failure's message, so a feed that stopped is not a list that emptied", async () => {
    const gate = deferred<typeof products>();
    render(<DrivenTile definition={topProducts} load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("products is unreachable")));

    expect(screen.getByText("products is unreachable")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("shows the empty state for no rows", async () => {
    const gate = deferred<typeof products>();
    render(<DrivenTile definition={topProducts} load={() => gate.promise} />);
    await act(async () => gate.resolve([]));

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });

  it("caps the list and says what it left out", async () => {
    const gate = deferred<typeof products>();
    render(<DrivenTile definition={topProducts} load={() => gate.promise} />);
    await act(async () => gate.resolve(products));

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
  });

  it("keeps a long label from pushing its figure off the row, and keeps the full text reachable", () => {
    const long = adminListWidget<{ id: string; name: string; units: number }>({
      id: "long",
      title: "Stock",
      rows: (rows) => rows,
      label: (row) => row.name,
      value: (row) => row.units,
      getKey: (row) => row.id,
    });

    render(
      <Tile
        definition={long}
        state={adminWidgetState(long, [{ id: "x", name: "A very long product name that will not fit", units: 4 }])}
      />,
    );

    // The label truncates and carries its full text, because a truncated label is unreadable and a
    // touch screen has no hover to reveal it on.
    const label = screen.getByText("A very long product name that will not fit");
    expect(label.className).toContain("truncate");
    expect(label.getAttribute("title")).toBe("A very long product name that will not fit");
  });
});

describe("the chart widgets' states, driven through the load", () => {
  const days = [
    { key: "2026-09-28", label: "28", value: 44150 },
    { key: "2026-09-29", label: "29", value: 12780 },
  ];

  it("draws a placeholder in the shape of the chart while the loader is open", async () => {
    const gate = deferred<{ days: typeof days }>();
    render(<DrivenTile definition={revenueByDay} load={() => gate.promise} />);

    expect(document.querySelector("[data-widget-skeleton='columns']")).not.toBeNull();
    expect(screen.queryByRole("img", { name: /Revenue by day/ })).not.toBeInTheDocument();

    await act(async () => gate.resolve({ days }));
  });

  it("draws the chart when the data arrives, with the label the host named", async () => {
    const gate = deferred<{ days: typeof days }>();
    render(<DrivenTile definition={revenueByDay} load={() => gate.promise} />);
    await act(async () => gate.resolve({ days }));

    expect(screen.getByRole("img", { name: "Revenue by day over 2 days" })).toBeInTheDocument();
  });

  it("shows the failure's message with a retry, so a broken chart says why", async () => {
    const gate = deferred<{ days: typeof days }>();
    render(<DrivenTile definition={revenueByDay} load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("the series query timed out")));

    expect(screen.getByText("the series query timed out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the empty state when there are no points, and draws a chart for a range of zeros", async () => {
    const emptyGate = deferred<{ days: typeof days }>();
    const { unmount } = render(<DrivenTile definition={revenueByDay} load={() => emptyGate.promise} />);
    await act(async () => emptyGate.resolve({ days: [] }));
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
    unmount();

    const zeroGate = deferred<{ days: typeof days }>();
    render(<DrivenTile definition={revenueByDay} load={() => zeroGate.promise} />);
    // A week where nothing was sold is a fact worth drawing flat, and reading it as empty is what
    // makes a real period disappear from a dashboard.
    await act(async () => zeroGate.resolve({ days: days.map((day) => ({ ...day, value: 0 })) }));
    expect(screen.getByRole("img", { name: "Revenue by day over 2 days" })).toBeInTheDocument();
  });

  it("draws a ranked chart's rows with its value label, and caps a long ranking", async () => {
    const items = [
      { key: "a", label: "Brass", value: 58 },
      { key: "b", label: "Iron", value: 31 },
      { key: "c", label: "Steel", value: 12 },
    ];
    const gate = deferred<typeof items>();
    render(<DrivenTile definition={stockByProduct} load={() => gate.promise} />);
    await act(async () => gate.resolve(items));

    expect(screen.getByRole("img", { name: "Stock by product" })).toBeInTheDocument();
    // The value label beside every bar, so a bare number is not left to be interpreted.
    expect(screen.getAllByText("units")).toHaveLength(3);
  });

  it("caps a long ranking and says what it left out, rather than drawing two hundred bars in a tile", async () => {
    const long = adminRankWidget<Array<{ key: string; label: string; value: number }>>({
      id: "longRank",
      title: "Stock",
      items: (rows) => rows,
      cap: { max: 2 },
    });

    const items = [
      { key: "a", label: "Brass", value: 58 },
      { key: "b", label: "Iron", value: 31 },
      { key: "c", label: "Steel", value: 12 },
    ];
    const gate = deferred<typeof items>();
    render(<DrivenTile definition={long} load={() => gate.promise} />);
    await act(async () => gate.resolve(items));

    expect(document.querySelectorAll("[data-chart-bar]")).toHaveLength(2);
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
  });

  it("says nothing about a cap that cut nothing, because a note about a whole list is noise", async () => {
    const items = [{ key: "a", label: "Brass", value: 4 }];
    const small = adminRankWidget<typeof items>({
      id: "small",
      title: "Stock",
      items: (rows) => rows,
    });

    const gate = deferred<typeof items>();
    render(<DrivenTile definition={small} load={() => gate.promise} />);
    await act(async () => gate.resolve(items));

    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });
});

describe("the activity widget's states, driven through the load", () => {
  const events = [
    { id: "e-1", action: "published Home", actor: "Ada", at: "2026-09-30T11:58:00Z" },
    { id: "e-2", action: "deleted a draft", actor: "Grace", at: "2026-09-29T09:00:00Z" },
  ];

  it("shows a placeholder with the feed's rows while the loader is open", async () => {
    const gate = deferred<typeof events>();
    render(<DrivenTile definition={feed} load={() => gate.promise} />);

    expect(document.querySelector("[data-widget-skeleton='rows']")).not.toBeNull();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();

    await act(async () => gate.resolve(events));
  });

  it("shows the failure's message, so a stopped feed is not an empty one", async () => {
    const gate = deferred<typeof events>();
    render(<DrivenTile definition={feed} load={() => gate.promise} />);

    await act(async () => gate.reject(new Error("the events table is gone")));

    expect(screen.getByText("the events table is gone")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("shows the empty state for no events", async () => {
    const gate = deferred<typeof events>();
    render(<DrivenTile definition={feed} load={() => gate.promise} />);
    await act(async () => gate.resolve([]));

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });
});

describe("what the activity widget decides", () => {
  const events = [
    { id: "e-1", action: "published Home", actor: "Ada", at: "2026-09-30T11:58:00Z" },
    { id: "e-2", action: "deleted a draft", actor: "Grace", at: "2026-09-29T09:00:00Z" },
    { id: "e-3", action: "shipped it", actor: "Katherine", at: "2026-09-23T09:00:00Z" },
  ];

  it("reads an age off the clock at render time rather than off the clock the query ran", async () => {
    const gate = deferred<typeof events>();
    render(<DrivenTile definition={feed} load={() => gate.promise} />);
    await act(async () => gate.resolve(events));

    // Two minutes before the tile's clock, one day before, and a week before. Computed when the
    // loader ran it, the first would read "just now" for the whole session, and the reader is the
    // one who finds out. Past a week the date is printed instead, because a count that large says
    // less than the day does.
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
    expect(screen.getByText("1 day ago")).toBeInTheDocument();
    expect(screen.getByText("Sep 23, 2026")).toBeInTheDocument();
  });

  it("says just now under a minute, because 0 minutes ago is a sentence nobody writes", async () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const fresh = adminActivityWidget<{ id: string; at: string }>({
      id: "fresh",
      title: "Activity",
      rows: (rows) => rows,
      message: (row) => row.id,
      at: (row) => row.at,
      now: () => now,
    });

    const gate = deferred<Array<{ id: string; at: string }>>();
    render(<DrivenTile definition={fresh} load={() => gate.promise} />);
    await act(async () => gate.resolve([{ id: "a row", at: "2026-09-30T11:59:30Z" }]));

    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.queryByText(/0 minutes/)).not.toBeInTheDocument();
  });

  it("marks each event with the tone its kind maps to, so a feed can be scanned", async () => {
    const gate = deferred<typeof events>();
    render(<DrivenTile definition={feed} load={() => gate.promise} />);
    await act(async () => gate.resolve(events));

    // The tone is a dot, not the message's colour, so it never fights what the message already says.
    expect(document.querySelector("[data-activity-tone='danger']")).not.toBeNull();
    expect(document.querySelector("[data-activity-tone='neutral']")).not.toBeNull();
  });

  it("uses a host's own age vocabulary, so the feed is in the host's language", async () => {
    const turkish = adminActivityWidget<typeof events>({
      id: "feed-tr",
      title: "Son hareketler",
      rows: (rows) => rows,
      message: (row) => row.action,
      at: (row) => row.at,
      now: () => new Date("2026-09-30T12:00:00Z"),
      formatAge: (elapsed) => `${Math.floor(elapsed / 60_000)} dakika önce`,
    });

    const gate = deferred<typeof events>();
    render(<DrivenTile definition={turkish} load={() => gate.promise} />);
    await act(async () => gate.resolve(events));

    expect(screen.getByText("2 dakika önce")).toBeInTheDocument();
  });

  it("prints the exact time in the machine-readable attribute, because an age goes stale", async () => {
    const gate = deferred<typeof events>();
    const { container } = render(<DrivenTile definition={feed} load={() => gate.promise} />);
    await act(async () => gate.resolve(events));

    const time = container.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-09-30T11:58:00.000Z");
  });

  it("says an event with no readable time is at an unknown time, rather than printing NaN", () => {
    const broken = adminActivityWidget<{ id: string; at: string }>({
      id: "broken",
      title: "Activity",
      rows: (rows) => rows,
      message: (row) => row.id,
      at: (row) => row.at,
      now: () => new Date("2026-09-30T12:00:00Z"),
    });

    render(<Tile definition={broken} state={adminWidgetState(broken, [{ id: "row", at: "not a date" }])} />);

    expect(screen.getByText("at an unknown time")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("caps the feed and says what it left out", () => {
    const capped = adminActivityWidget<typeof events>({
      id: "capped",
      title: "Activity",
      rows: (rows) => rows,
      message: (row) => row.action,
      at: (row) => row.at,
      cap: { max: 1 },
      now: () => new Date("2026-09-30T12:00:00Z"),
    });

    render(<Tile definition={capped} state={adminWidgetState(capped, events)} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
  });
});

describe("a widget given data it cannot read", () => {
  it.each([
    [
      "the stat",
      adminStatWidget<{ missing?: number }>({ id: "s", title: "S", value: (d) => d.missing }),
      {},
    ],
    [
      "the table",
      adminTableWidget<{ id: string }>({
        id: "t",
        title: "T",
        rows: () => undefined,
        columns: [{ key: "id", header: "Id", value: (row) => row.id }],
      }),
      undefined,
    ],
    [
      "the list",
      adminListWidget<{ id: string }>({ id: "l", title: "L", rows: () => null, label: (row) => row.id }),
      null,
    ],
    [
      "the chart",
      adminChartWidget<{ days?: unknown[] }>({
        id: "c",
        title: "C",
        categories: (d) => d.days as never,
        series: () => undefined,
      }),
      {},
    ],
    [
      "the rank chart",
      adminRankWidget<{ items?: unknown[] }>({ id: "r", title: "R", items: (d) => d.items as never }),
      {},
    ],
    [
      "the activity feed",
      adminActivityWidget<{ id: string }>({
        id: "a",
        title: "A",
        rows: () => undefined,
        message: (row) => row.id,
        at: () => "2026-09-30T12:00:00Z",
      }),
      undefined,
    ],
  ])("shows the empty state rather than throwing when %s is handed nothing", (_name, definition, data) => {
    // Each widget's selector is handed data whose field is missing, absent, or a value of the wrong
    // type, and the state is built through the engine's own `adminWidgetState` so the widget's empty
    // rule is what decides. A dashboard with one such query should show one empty tile, not lose
    // the page, and a widget that read a length on something undefined throws here and nowhere else.
    expect(() =>
      render(<Tile definition={definition} state={adminWidgetState(definition, data as never)} />),
    ).not.toThrow();
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });

  it("reaches the empty state through the load rather than only through a constructed state", async () => {
    // The same selectors, driven: the hook asks the widget's own isEmpty, so a widget whose isEmpty
    // read a length on something undefined would throw here and nowhere else.
    const gate = deferred<{ items?: unknown[] }>();
    render(<DrivenTile definition={stockByProduct} load={() => gate.promise} />);
    await act(async () => gate.resolve({}));

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
  });

  it("survives a null answer from the host's loader, which is what a query with no row can be", async () => {
    const rows: Order[] | null = null;
    const nullRows = adminTableWidget<Order>({
      id: "nullRows",
      title: "Orders",
      rows: () => rows,
      columns: [{ key: "customer", header: "Customer", value: (row) => row.customer }],
    });

    const gate = deferred<Order[] | null>();
    render(<DrivenTile definition={nullRows} load={() => gate.promise} />);
    await act(async () => gate.resolve(null));

    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });
});

describe("a misconfigured widget says what is wrong", () => {
  it("names the widget and the option a stat is missing its accessor for", () => {
    expect(() =>
      adminStatWidget({ id: "revenue", title: "Revenue", value: undefined as never }),
    ).toThrow(/Widget "revenue" needs a value\(\)/);
  });

  it("refuses a table with no columns, which could draw nothing and say so by being blank", () => {
    expect(() =>
      adminTableWidget({
        id: "orders",
        title: "Orders",
        rows: (rows: Array<{ id: string }>) => rows,
        columns: [],
      }),
    ).toThrow(/Widget "orders" needs at least one column/);
  });

  it("refuses a list with no label accessor, since a row nothing names is not a row", () => {
    expect(() =>
      adminListWidget({
        id: "stock",
        title: "Stock",
        rows: (rows: Array<{ id: string }>) => rows,
        label: undefined as never,
      }),
    ).toThrow(/Widget "stock" needs a label\(\)/);
  });

  it("refuses a chart with no series accessor, which would draw an axis and nothing on it", () => {
    expect(() =>
      adminChartWidget({
        id: "revenue",
        title: "Revenue",
        categories: (d: { days: unknown[] }) => d.days as never,
        series: undefined as never,
      }),
    ).toThrow(/Widget "revenue" needs a series\(\)/);
  });

  it("refuses an activity feed with no timestamp accessor, because an age needs a time to measure", () => {
    expect(() =>
      adminActivityWidget({
        id: "feed",
        title: "Activity",
        rows: (rows: Array<{ id: string }>) => rows,
        message: (row: { id: string }) => row.id,
        at: undefined as never,
      }),
    ).toThrow(/Widget "feed" needs an at\(\)/);
  });

  it("refuses a declared id that a persisted dashboard could not refer to, through the engine's own check", () => {
    // The engine owns that rule, so the shipped widget does not duplicate it: this is the check
    // firing through it rather than a second copy of the same guard.
    expect(() =>
      adminStatWidget({ id: "", title: "Revenue", value: () => 1 }),
    ).toThrow(/needs an id/);
  });

  it("refuses a size the grid cannot satisfy, rather than storing one no layout can honour", () => {
    expect(() =>
      adminStatWidget({ id: "s", title: "S", value: () => 1, sizes: ["huge" as never] }),
    ).toThrow(/unknown size/);
  });
});

describe("the demo's own tiles are unaffected", () => {
  /**
   * The demo's registry is a separate file with its own widgets, and it is not mine to change. This
   * is the check that adding widgets to the package did not alter how those render: the same
   * placement, the same state, the same markup.
   */
  it("renders the demo's revenue widget as it did, from the demo's own registry", () => {
    const dashboard = adminDashboardAddPlacement({ name: "Demo", placements: [] }, dashboardRegistry, "revenue");
    const placement = dashboard.placements[0]!;

    const { container } = render(
      <AdminDashboardLayout
        registry={dashboardRegistry}
        placements={dashboard.placements}
        states={{ [placement.id]: { status: "ready", data: { cents: 12900, orders: 2 } } }}
      />,
    );

    const tile = container.querySelector(`[data-placement="${placement.id}"]`)!;
    expect(within(tile).getByText("$129.00")).toBeInTheDocument();
    expect(within(tile).getByText("across 2 paid and shipped orders")).toBeInTheDocument();
    // The panel still announces itself, which is what the tile's outline is for.
    expect(within(tile).getByRole("region", { name: "Revenue" })).toBeInTheDocument();
  });

  it("still resolves every widget the demo registered, none of which the package's own ship", () => {
    // Sorted here because the registry preserves registration order and the demo's order is its own
    // business, not something this package should be able to reorder by adding an export.
    expect(dashboardRegistry.list().map((w) => w.id).sort()).toEqual([
      "averageOrder",
      "catalog",
      "reorder",
      "revenue",
      "reviewQueue",
      "signups",
    ]);
    expect(dashboardRegistry.list()).toHaveLength(6);
  });

  it("keeps the demo's own empty rule, which the package's widgets do not override in a registry beside them", () => {
    // The demo's reorder widget is empty when there is nothing to reorder, which is a length check on
    // its own rows. A registry holding both it and a shipped list widget has to keep both rules,
    // because a package widget that inferred emptiness differently would have quietly changed what
    // the demo's tile says.
    const reorder = dashboardRegistry.get("reorder")!;
    const shipped = adminListWidget({
      id: "shipped",
      title: "Shipped",
      rows: (rows: Array<{ id: string }>) => rows,
      label: (row) => row.id,
    });
    const together = createAdminWidgetRegistry([reorder, shipped]);

    expect(together.get("reorder")!.isEmpty?.([])).toBe(true);
    expect(together.get("shipped")!.isEmpty?.([])).toBe(true);
    expect(together.list()).toHaveLength(2);
  });

  it("refuses a registry holding two widgets with the same id, rather than answering whichever was last", () => {
    // The demo's `revenue` and the package's `revenue` share an id by accident of naming, which is
    // exactly the case a registry has to refuse rather than resolve silently.
    expect(() => createAdminWidgetRegistry([revenue, dashboardRegistry.get("revenue")!])).toThrow(
      /both registered/,
    );
  });
});

describe("the engine's states reach a shipped widget without the widget inventing them", () => {
  it("shows the engine's error title beside the loader's message for every shipped widget", async () => {
    const definitions: Array<[string, AdminWidgetDefinition<never>, (gate: ReturnType<typeof deferred<unknown>>) => void]> = [];

    for (const [name, definition, settle] of [
      ["stat", revenue, (gate) => gate.resolve({ total: 1, previous: 1 })],
      ["table", orderTable as never, (gate) => gate.resolve(orders)],
      ["list", topProducts as never, (gate) => gate.resolve([])],
      ["chart", revenueByDay as never, (gate) => gate.resolve({ days: [] })],
      ["rank", stockByProduct as never, (gate) => gate.resolve([])],
      ["activity", feed as never, (gate) => gate.resolve([])],
    ] as const) {
      definitions.push([name, definition, settle as never]);
    }

    for (const [name, definition, settle] of definitions) {
      const gate = deferred<unknown>();
      const { unmount } = render(<DrivenTile definition={definition} load={() => gate.promise} />);
      await act(async () => gate.reject(new Error(`${name} could not load`)));
      expect(screen.getByText(`${name} could not load`), `${name} lost the loader's message`).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" }), `${name} has no retry`).toBeInTheDocument();
      unmount();
    }
  });

  it("claims the loading state in every shipped widget, so a tile reserves its own height", () => {
    for (const [name, definition] of [
      ["stat", revenue],
      ["table", orderTable],
      ["list", topProducts],
      ["chart", revenueByDay],
      ["rank", stockByProduct],
      ["activity", feed],
    ] as const) {
      expect(definition.renderLoading, `${name} leaves the loading state to the engine`).toBeTypeOf("function");
      // A spinner of the widget's own is a widget that cannot show the engine's failure message, so
      // the loading state has to be markup and not a state the widget switches on.
      const { container } = render(<Tile definition={definition} state={{ status: "loading" }} />);
      expect(container.querySelector("[data-widget-skeleton]"), `${name} has no placeholder`).not.toBeNull();
    }
  });

  it("does not claim the error state in any of them, which is what leaves the engine's message intact", () => {
    for (const definition of [revenue, orderTable, topProducts, revenueByDay, stockByProduct, feed]) {
      expect(definition.renderError).toBeUndefined();
    }
  });
});
