// SPDX-License-Identifier: MIT
import { createElement } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminDashboardValidate } from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { queryResourceAction } from "../fixtures/lib/resource-actions";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import {
  loadDashboardArrangementAction,
  type DashboardArrangementEntry,
} from "../fixtures/lib/demo-dashboard-arrangement";
import DashboardPage from "../fixtures/app/dashboard/page";
import DashboardArranger from "../fixtures/app/dashboard/arrange/arranger";
import { dashboardRegistry } from "../fixtures/app/dashboard/registry";

/**
 * The arrangement the dashboard renders, read from and written back to the store.
 *
 * The page used to render a constant declared beside the widgets, so a person saw an arrangement no
 * row described and nothing on the page could say which of the two was true. Every call here is the
 * published action with the session a signed cookie resolves to, and the thing under test is the
 * page rather than the action alone: the arrangement the store holds and the arrangement the grid
 * shows are one claim, and a test that checked only one would pass against a demo doing either.
 *
 * Each widget's own data is stood in for, because the milestone is the arrangement and not the
 * aggregates, which `demo-dashboard-data.test.ts` already measures against the seeded workspace.
 */

const widgets = vi.hoisted(() => ({
  revenue: vi.fn(),
  catalog: vi.fn(),
  reorder: vi.fn(),
  pending: vi.fn(),
  signups: vi.fn(),
  average: vi.fn(),
}));

vi.mock("../fixtures/lib/dashboard-data", () => ({
  loadRevenueAction: async () => widgets.revenue(),
  loadCatalogAction: async () => widgets.catalog(),
  loadReorderAction: async () => widgets.reorder(),
  loadPendingOrdersAction: async () => widgets.pending(),
  loadSignupCountAction: async () => widgets.signups(),
  loadAverageOrderValueAction: async () => widgets.average(),
}));

/**
 * The save the arranger calls, stood in for.
 *
 * The arranger runs in a browser and the action runs on a server, and the seam between them is the
 * same one the demo is built on: the session adapter refuses to reach for a cookie from anything
 * shaped like a browser, and React cannot render a tile without one. So the arranger's own wiring is
 * checked here, against a recorded call, and what the action does with that call is checked by
 * calling the real one directly further down. Neither half is assumed by the other.
 */
const saves = vi.hoisted(() => ({
  calls: [] as { dashboard: string; entries: unknown[] }[],
  refusal: null as string | null,
}));

vi.mock("../fixtures/lib/demo-dashboard-arrangement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fixtures/lib/demo-dashboard-arrangement")>();
  return {
    ...actual,
    saveDashboardArrangementAction: async (dashboard: string, entries: { id: string }[]) => {
      saves.calls.push({ dashboard, entries });
      if (saves.refusal) throw new Error(saves.refusal);
      return { name: dashboard, placements: entries };
    },
  };
});

/** The real action, which the tests below call the way a browser would post to it. */
async function realActions() {
  return (await vi.importActual<typeof import("../fixtures/lib/demo-dashboard-arrangement")>(
    "../fixtures/lib/demo-dashboard-arrangement",
  ));
}

/** A save, called the way a browser posts to the action rather than through the arranger's stand-in. */
async function save(dashboard: string, entries: DashboardArrangementEntry[]) {
  const actions = await realActions();
  return asServer(() => actions.saveDashboardArrangementAction(dashboard, entries));
}

/**
 * One call on the side of the boundary that has no browser.
 *
 * The session adapter refuses to reach for a cookie from anything shaped like a browser, and React
 * reads one to render a tile, so the two cannot share a call stack. The global goes for the length of
 * the action and not for the length of the test, because a scheduled render landing in between is a
 * crash rather than a failure.
 */
async function asServer<T>(work: () => Promise<T>): Promise<T> {
  vi.stubGlobal("window", undefined);
  try {
    return await work();
  } finally {
    vi.unstubAllGlobals();
  }
}

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;
const DASHBOARD = "overview";

type Row = { id: string; widget: string; size: string; position: number };

/**
 * An arrangement no constant in the demo would produce: three of the six registered widgets, a wide
 * revenue tile, and written into the store in an order that is not the order they are stored in. A
 * reader that ignored `position` would show them in the order they were created.
 */
const ARRANGED: Row[] = [
  { id: "row_revenue", widget: "revenue", size: "xl", position: 1 },
  { id: "row_average", widget: "averageOrder", size: "sm", position: 2 },
  { id: "row_catalog", widget: "catalog", size: "sm", position: 0 },
];

async function signIn(account: { email: string; role: string }) {
  const result = await asServer(async () => await signInAction({ email: account.email, password: DEMO_PASSWORD }, ""));
  expect(result.ok).toBe(true);
  return request.session;
}

async function writeArrangement(rows: readonly Row[]) {
  for (const row of await store.query<{ id: string }>("dashboard_placements")) {
    await store.delete("dashboard_placements", row.id);
  }
  for (const row of rows) {
    await store.create("dashboard_placements", { dashboard: DASHBOARD, ...row });
  }
}

async function storedRows(): Promise<Row[]> {
  const rows = (await store.query<Row>("dashboard_placements")) as Row[];
  return rows.sort((left, right) => left.position - right.position);
}

/** Each rendered placement, in the order the grid put them down. */
function renderedTiles() {
  return [...document.querySelectorAll("[data-placement]")].map((element) => ({
    id: element.getAttribute("data-placement"),
    widget: element.getAttribute("data-widget"),
    className: element.className,
  }));
}

function tileFor(widget: string): HTMLElement {
  const element = document.querySelector(`[data-widget='${widget}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`no tile for ${widget}`);
  return element;
}

/**
 * The page rendered the way a request renders it: the server half runs with no browser-shaped global
 * beside it, and the view it hands over is mounted once it is back in one.
 */
async function renderPage() {
  const element = await asServer(async () => await DashboardPage());
  return render(element);
}

/** The same arrangement read, for the parts of the test that are not about the page itself. */
function loadArrangement() {
  return asServer(() => loadDashboardArrangementAction(DASHBOARD));
}

beforeEach(async () => {
  // The session adapter refuses to reach for a cookie from anything shaped like a browser, and jsdom
  // is one. The actions are server code, so they run without it.
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  saves.calls.length = 0;
  saves.refusal = null;
  widgets.revenue.mockResolvedValue({ cents: 25500, orders: 4 });
  widgets.catalog.mockResolvedValue({ products: 5, units: 110 });
  widgets.reorder.mockResolvedValue([{ name: "Walnut monitor riser", sku: "RISR-001", stock: 0 }]);
  widgets.pending.mockResolvedValue({ pending: 1 });
  widgets.signups.mockRejectedValue(new Error('"users" is not a resource this admin exposes'));
  widgets.average.mockResolvedValue({ cents: 6375, orders: 4 });
  await signIn(owner);
  await writeArrangement(ARRANGED);
  // The window is restored before the test body, so a scheduled render from anything a test mounts
  // has a window to render into. Each call that is on the server side says so itself.
  vi.unstubAllGlobals();
});

afterEach(async () => {
  // A tile that answered as the test ended still has a render queued, and React runs that queue from
  // a macrotask. Draining it here, while there is a window to render into, is what keeps the next
  // test's server-side call from being the place a stale render lands.
  await act(async () => {});
  vi.unstubAllGlobals();
});

describe("the arrangement the page renders", () => {
  it("shows every widget the store lists, in the order the rows give them", async () => {
    await renderPage();

    // Created in the order revenue, averageOrder, catalog and stored as catalog, revenue,
    // averageOrder. The grid reads the second, and no constant in the bundle agrees with either.
    expect(renderedTiles().map((tile) => tile.widget)).toEqual(["catalog", "revenue", "averageOrder"]);

    await waitFor(() => expect(within(tileFor("catalog")).getByText("5")).toBeInTheDocument());
    expect(within(tileFor("revenue")).getByText("$255.00")).toBeInTheDocument();
    // The size is a column the rows hold: `xl` spans four at the breakpoint where the grid has four
    // columns, and the tile carries the class rather than a hint that it might.
    expect(tileFor("revenue").className).toContain("lg:col-span-4");
    expect(tileFor("catalog").className).toContain("md:col-span-1");
  });

  it("reads the rows again rather than the ones it read before", async () => {
    // The same page, the same process, the same component: only the store changed between the two
    // renders, so what differs on screen is what the rows said.
    const first = await renderPage();
    expect(renderedTiles().map((tile) => tile.widget)).toEqual(["catalog", "revenue", "averageOrder"]);
    first.unmount();

    await writeArrangement([
      { id: "row_revenue", widget: "revenue", size: "xl", position: 0 },
      { id: "row_catalog", widget: "catalog", size: "sm", position: 1 },
      { id: "row_average", widget: "averageOrder", size: "sm", position: 2 },
    ]);

    await renderPage();
    expect(renderedTiles().map((tile) => tile.widget)).toEqual(["revenue", "catalog", "averageOrder"]);
  });
});

describe("an arrangement a person changed", () => {
  it("is still there after a reload, in the order and at the size it was saved", async () => {
    // A reorder and a resize in one save, which is what dragging a card and picking a size do
    // together. Positions are written in two passes because the table is unique on
    // `(dashboard, position)`, so the order is only right if both passes landed.
    await save(DASHBOARD, [
      { id: "row_average", widget: "averageOrder", size: "sm" },
      { id: "row_revenue", widget: "revenue", size: "lg" },
      { id: "row_reorder", widget: "reorder", size: "md" },
      { id: "row_catalog", widget: "catalog", size: "sm" },
    ]);

    // The rows themselves, not only what the save answered with.
    expect((await storedRows()).map((row) => row.id)).toEqual([
      "row_average",
      "row_revenue",
      "row_reorder",
      "row_catalog",
    ]);
    expect((await storedRows()).map((row) => row.position)).toEqual([0, 1, 2, 3]);
    expect((await storedRows()).find((row) => row.id === "row_revenue")?.size).toBe("lg");
    expect((await storedRows()).find((row) => row.id === "row_reorder")?.size).toBe("md");

    // The reload: a fresh read, and the page over it.
    const reloaded = await loadArrangement();
    expect(reloaded.placements.map((placement) => placement.id)).toEqual([
      "row_average",
      "row_revenue",
      "row_reorder",
      "row_catalog",
    ]);

    await renderPage();
    expect(renderedTiles().map((tile) => tile.widget)).toEqual([
      "averageOrder",
      "revenue",
      "reorder",
      "catalog",
    ]);
    expect(tileFor("revenue").className).toContain("lg:col-span-3");
    expect(tileFor("reorder").className).toContain("md:col-span-2");
  });

  it("passes the whole arrangement, resized, to the save", async () => {
    // The arranger is the only surface that offers the change, so the change is made there. Drag and
    // drop is the engine's collection editor, which `collection-editor.test.tsx` already measures;
    // what is under test is that a size a person picked is the next thing the save is asked for.
    const arrangement = await loadArrangement();
    const user = userEvent.setup();
    render(createElement(DashboardArranger, { dashboard: arrangement }));

    await user.click(screen.getByRole("button", { name: /Revenue/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Size" }), "lg");

    await waitFor(() => expect(saves.calls).toHaveLength(1));
    expect(saves.calls[0].dashboard).toBe(DASHBOARD);
    // The whole list, in the new order and at the new size, because order and membership are one
    // fact: an update plus a delete is what a partial save would be.
    expect(saves.calls[0].entries).toEqual([
      { id: "row_catalog", widget: "catalog", size: "sm" },
      { id: "row_revenue", widget: "revenue", size: "lg" },
      { id: "row_average", widget: "averageOrder", size: "sm" },
    ]);
  });

  it("puts the saved arrangement back and says why when the save is refused", async () => {
    saves.refusal = "This session may not delete dashboard_placements";
    const arrangement = await loadArrangement();
    const user = userEvent.setup();
    render(createElement(DashboardArranger, { dashboard: arrangement }));

    await user.click(screen.getByRole("button", { name: /Revenue/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Size" }), "lg");

    // The refusal is answered on screen, and the editor is not left showing a tile the rows do not
    // have: an arranger that kept the change would be the next save's problem, silently.
    await waitFor(() => expect(screen.getByText("Not saved")).toBeInTheDocument());
    expect(screen.getByText("This session may not delete dashboard_placements")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Size" })).toHaveValue("xl");
  });

  it("writes what the arranger sent, so a change made there survives a reload", async () => {
    const arrangement = await loadArrangement();
    const user = userEvent.setup();
    render(createElement(DashboardArranger, { dashboard: arrangement }));

    await user.click(screen.getByRole("button", { name: /Revenue/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Size" }), "lg");
    await waitFor(() => expect(saves.calls).toHaveLength(1));

    // The recorded call, through the action a browser posts to.
    await save(DASHBOARD, saves.calls[0].entries as DashboardArrangementEntry[]);
    expect((await storedRows()).find((row) => row.id === "row_revenue")?.size).toBe("lg");

    // The reload: a fresh read and the page over it, with nothing the click left in memory.
    await renderPage();
    expect(renderedTiles().map((tile) => tile.widget)).toEqual(["catalog", "revenue", "averageOrder"]);
    expect(tileFor("revenue").className).toContain("lg:col-span-3");
  });
});

describe("what a session may do to the arrangement", () => {
  it("lets the administrator reorder, add and remove", async () => {
    const saved = await save(DASHBOARD, [
      { id: "row_revenue", widget: "revenue", size: "xl" },
      { id: "row_review", widget: "reviewQueue", size: "sm" },
    ]);
    expect(saved.placements.map((placement) => placement.id)).toEqual(["row_revenue", "row_review"]);
    expect((await storedRows()).map((row) => row.id)).toEqual(["row_revenue", "row_review"]);
  });

  it("lets the editor create and update, which is the half of a save they may do", async () => {
    await signIn(editor);

    const saved = await save(DASHBOARD, [
      { id: "row_catalog", widget: "catalog", size: "sm" },
      { id: "row_revenue", widget: "revenue", size: "lg" },
      { id: "row_average", widget: "averageOrder", size: "sm" },
      { id: "row_review", widget: "reviewQueue", size: "sm" },
    ]);

    expect(saved.placements.map((placement) => placement.id)).toEqual([
      "row_catalog",
      "row_revenue",
      "row_average",
      "row_review",
    ]);
    expect((await storedRows()).find((row) => row.id === "row_revenue")?.size).toBe("lg");
  });

  it("refuses the editor the delete, before anything is written", async () => {
    await signIn(editor);

    // The call an attacker makes: no button in the arranger is hidden for an editor, and this is
    // what the action answers. Three rows go in, one comes out, and the delete is the part refused.
    await expect(
      save(DASHBOARD, [{ id: "row_catalog", widget: "catalog", size: "sm" }]),
    ).rejects.toThrow(/may not delete dashboard_placements/);

    // Every row is where it was, and at the position it was: a refusal that parked the arrangement
    // and put it back would pass the id check and fail this one.
    expect((await storedRows()).map((row) => row.id)).toEqual(["row_catalog", "row_revenue", "row_average"]);
    expect((await storedRows()).map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("leaves the orders alone when an editor saves an arrangement", async () => {
    await signIn(editor);
    const before = ((await store.query("orders")) as { id: string }[]).map((row) => row.id).sort();

    await save(DASHBOARD, [
      { id: "row_catalog", widget: "catalog", size: "sm" },
      { id: "row_revenue", widget: "revenue", size: "lg" },
      { id: "row_average", widget: "averageOrder", size: "sm" },
    ]);

    expect(((await store.query("orders")) as { id: string }[]).map((row) => row.id).sort()).toEqual(before);
    // And arranging a widget is not a second way into them: the same action the tiles call refuses an
    // editor the orders, so a tile the person puts on the dashboard still cannot read the money.
    await expect(asServer(() => queryResourceAction("orders"))).rejects.toThrow(/may not read orders/);
  });

  it("sends an anonymous caller to the login page rather than answering", async () => {
    request.session = undefined;

    await expect(loadArrangement()).rejects.toThrow(guard.RedirectSignal);
    await expect(save(DASHBOARD, [])).rejects.toThrow(guard.RedirectSignal);
  });
});

describe("an arrangement this build cannot render", () => {
  it("refuses to save a placement naming a widget this build does not register", async () => {
    await expect(
      save(DASHBOARD, [
        { id: "row_catalog", widget: "catalog", size: "sm" },
        { id: "row_notes", widget: "notes", size: "sm" },
      ]),
    ).rejects.toThrow(/No widget is registered as "notes"/);

    // The refusal is the whole save rather than the one placement, so nothing moved.
    expect((await storedRows()).map((row) => row.id)).toEqual(["row_catalog", "row_revenue", "row_average"]);
  });

  it("refuses to save a size the widget itself does not support", async () => {
    await expect(
      save(DASHBOARD, [
        { id: "row_catalog", widget: "catalog", size: "sm" },
        { id: "row_revenue", widget: "revenue", size: "xl" },
        { id: "row_average", widget: "averageOrder", size: "sm" },
        { id: "row_reorder", widget: "reorder", size: "lg" },
      ]),
    ).rejects.toThrow(/does not support the size "lg"/);
  });

  it("reports each placement the registry cannot render, keyed by the row that names it", () => {
    const problems = adminDashboardValidate(dashboardRegistry, [
      { id: "plc_signups", widget: "signups", size: "sm" },
      { id: "plc_notes", widget: "notes", size: "sm" },
      { id: "plc_revenue", widget: "revenue", size: "sm" },
    ]);

    expect([...problems.keys()].sort()).toEqual(["plc_notes", "plc_revenue"]);
    expect(problems.get("plc_notes")).toEqual(['No widget is registered as "notes"']);
    expect(problems.get("plc_revenue")?.[0]).toMatch(/does not support the size "sm"/);
  });

  it("never drops a placement naming a widget this build does not register, and still renders the rest", async () => {
    // A widget the store has and the code does not is a problem in place, not a blank cell and not a
    // dashboard that took the other three tiles down with it. `notes` is seeded and never registered,
    // which is exactly the shape a dashboard saved by an earlier release has.
    await writeArrangement([...ARRANGED, { id: "row_notes", widget: "notes", size: "sm", position: 3 }]);
    const arrangement = await loadArrangement();
    expect(arrangement.placements.map((placement) => placement.id)).toEqual([
      "row_catalog",
      "row_revenue",
      "row_average",
      "row_notes",
    ]);

    await renderPage();
    expect(renderedTiles().map((tile) => tile.widget)).toEqual(["catalog", "revenue", "averageOrder", "notes"]);
    expect(tileFor("notes").textContent).toMatch(/this build does not provide/);
    // The tiles on either side of the problem answered with their own data.
    await waitFor(() => expect(within(tileFor("catalog")).getByText("5")).toBeInTheDocument());
    expect(within(tileFor("revenue")).getByText("$255.00")).toBeInTheDocument();
    expect(document.body.textContent).toContain("1 problems across 4 placements");
  });
});
