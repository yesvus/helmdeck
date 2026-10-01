// SPDX-License-Identifier: MIT
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminI18nProvider, adminDashboardAddPlacement, type AdminDashboard } from "@yesvus/helmdeck";
import DashboardView from "../fixtures/app/(helmdeck)/dashboard/view";
import { dashboardRegistry } from "../fixtures/app/(helmdeck)/dashboard/registry";

/**
 * The dashboard's server actions, stood in for.
 *
 * The view and the engine's tile are the real ones, so what is under test here is the grid over a
 * resolved arrangement: that a widget's data reaches the screen, and that a slow widget and a failing
 * one are states the grid renders rather than states a fixture claims. The arrangement is passed in
 * because the page now reads it from the store, which `demo-dashboard-arrangement.test.ts` covers from
 * the row up. The slow action hands back a promise the test settles by hand, which is what makes the
 * ordering decided rather than raced.
 */
const backend = vi.hoisted(() => ({
  signups: vi.fn(),
  average: vi.fn(),
}));

let releaseSlow: (value: { cents: number; orders: number }) => void = () => {
  throw new Error("no slow answer is pending");
};

vi.mock("../fixtures/lib/dashboard-data", () => ({
  loadRevenueAction: async () => ({ cents: 25500, orders: 4 }),
  loadCatalogAction: async () => ({ products: 5, units: 110 }),
  loadReorderAction: async () => [
    { name: "Walnut monitor riser", sku: "RISR-001", stock: 0 },
    { name: "Ash standing desk", sku: "DESK-001", stock: 6 },
  ],
  loadPendingOrdersAction: async () => ({ pending: 1 }),
  loadSignupCountAction: backend.signups,
  loadAverageOrderValueAction: backend.average,
}));

/** The panel for one widget, which is the element that carries the state. */
function tile(widget: string): HTMLElement {
  const panel = document.querySelector(`[data-widget='${widget}'][data-widget-state]`);
  if (!(panel instanceof HTMLElement)) throw new Error(`no tile for ${widget}`);
  return panel;
}

function stateOf(widget: string): string | null {
  return tile(widget).getAttribute("data-widget-state");
}

/**
 * The six tiles the demo registers, at the size each one declares it supports.
 *
 * Read through `adminDashboardAddPlacement` rather than written out, so a tile lands at a size its own
 * widget agrees to and cannot be placed at one it does not. It is a test's arrangement rather than the
 * demo's: the demo's comes from the placements table.
 */
const ARRANGEMENT: AdminDashboard = [
  "revenue",
  "signups",
  "catalog",
  "reorder",
  "reviewQueue",
  "averageOrder",
].reduce<AdminDashboard>(
  (current, widget) => adminDashboardAddPlacement(current, dashboardRegistry, widget),
  { name: "overview", placements: [] },
);

function renderPage() {
  return render(
    <AdminI18nProvider locale="en">
      <DashboardView dashboard={ARRANGEMENT} />
    </AdminI18nProvider>,
  );
}

beforeEach(() => {
  // A slow answer per test rather than one shared promise, because a tile that was allowed to
  // answer in an earlier test would leave the next one measuring a dashboard that is not slow.
  let release!: (value: { cents: number; orders: number }) => void;
  const slowAnswer = new Promise<{ cents: number; orders: number }>((resolve) => {
    release = resolve;
  });
  releaseSlow = (value) => release(value);
  backend.signups.mockRejectedValue(new Error('"users" is not a resource this admin exposes'));
  backend.average.mockImplementation(() => slowAnswer);
});

describe("the demo dashboard", () => {
  it("shows money and counts taken from the store, formatted from the cents the sum produced", async () => {
    renderPage();

    // 25500 cents and 5 products: the seed's own totals, divided by 100 only here.
    await waitFor(() => expect(within(tile("revenue")).getByText("$255.00")).toBeInTheDocument());
    expect(within(tile("catalog")).getByText("5")).toBeInTheDocument();
    expect(within(tile("catalog")).getByText("110 units in stock")).toBeInTheDocument();
    expect(within(tile("reviewQueue")).getByText("1")).toBeInTheDocument();
    expect(within(tile("reorder")).getByText("Walnut monitor riser")).toBeInTheDocument();
  });

  it("has the tiles beside a slow widget ready while it is still waiting", async () => {
    // The property the page exists to show, and it is measured rather than asserted: the four fast
    // tiles are on screen with their data before the slow action is allowed to answer at all.
    renderPage();

    await waitFor(() => expect(stateOf("revenue")).toBe("ready"));
    expect(stateOf("catalog")).toBe("ready");
    expect(stateOf("reorder")).toBe("ready");
    expect(stateOf("reviewQueue")).toBe("ready");
    // Nothing has been released yet, so this tile cannot have data. It is loading, not empty and
    // not failed.
    expect(stateOf("averageOrder")).toBe("loading");
    expect(within(tile("averageOrder")).queryByText("$63.75")).not.toBeInTheDocument();
  });

  it("shows the slow tile's own answer once it lands, and only then", async () => {
    renderPage();
    await waitFor(() => expect(stateOf("averageOrder")).toBe("loading"));

    releaseSlow({ cents: 6375, orders: 4 });

    await waitFor(() => expect(within(tile("averageOrder")).getByText("$63.75")).toBeInTheDocument());
    expect(stateOf("averageOrder")).toBe("ready");
  });

  it("shows what a refused read failed with, and retries it on the tile's own control", async () => {
    const user = userEvent.setup();
    renderPage();

    // The failure is the boundary's own message rather than a status a fixture wrote, which is why
    // this tile fails and the others do not.
    await waitFor(() => expect(stateOf("signups")).toBe("error"));
    expect(within(tile("signups")).getByText(/not a resource this admin exposes/)).toBeInTheDocument();
    expect(backend.signups).toHaveBeenCalledTimes(1);

    await user.click(within(tile("signups")).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(backend.signups).toHaveBeenCalledTimes(2));
    // The other tiles are untouched by the retry: it is one tile's control.
    expect(stateOf("revenue")).toBe("ready");
  });

  it("keeps a tile that failed out of the count of tiles showing data", async () => {
    renderPage();

    await waitFor(() => expect(stateOf("signups")).toBe("error"));
    // A failed widget and an empty one both render as no data, so a count of ready tiles that
    // included them would be reporting a dashboard that has more than it does.
    expect(document.querySelectorAll("[data-widget-state='ready']")).toHaveLength(4);
  });
});
