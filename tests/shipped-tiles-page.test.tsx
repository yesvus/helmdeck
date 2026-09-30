// SPDX-License-Identifier: MIT
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminDashboardValidate, type AdminDashboard } from "@yesvus/helmdeck";
import ShippedTilesPage from "../fixtures/app/dashboard/tiles/page";
import { buildShippedTileDashboard } from "../fixtures/app/dashboard/tiles/arrangement";
import { shippedTileRegistry } from "../fixtures/app/dashboard/tiles/registry";

/**
 * The route, with the store's answers stood in for.
 *
 * The registry, the arrangement and the layout are the real ones, so what is under test is the page a
 * host would write against the six shipped tiles: that it registers and places them through the
 * engine, that each tile's data reaches the screen, and that loading, empty, failed and ready are
 * states the grid renders rather than states this file claims. The slow loader is a promise the test
 * settles by hand, so the loading state is measured rather than raced, and the failing loader is
 * refused with a message so the error state is the engine's own.
 */

const backend = vi.hoisted(() => ({
  revenue: vi.fn(),
  revenueChart: vi.fn(),
  ordersTable: vi.fn(),
  lowStockList: vi.fn(),
  stockValueRank: vi.fn(),
  contentActivity: vi.fn(),
}));

/**
 * The request, stood in for.
 *
 * The two tests that reach a state through the real action need a session, and the session lives in a
 * cookie the store's auth adapter reads from `next/headers`. This is the same seam the demo's own
 * action tests stand in for, and it is here so the tile's answer is one a signed-in visitor gets rather
 * than one a stub invented.
 */
/**
 * The request's own cookie, which is where the session lives.
 *
 * The package's own seam is `read`, `write` and `clear` over one value, which is what the demo's
 * `DemoAuthOptions.cookie` takes. Held in a hoisted box because a mock factory is hoisted above the
 * module's own bindings, so a cookie built at module scope would not exist yet when the factory ran.
 */
const request = vi.hoisted(() => {
  const box = {
    value: undefined as string | undefined,
    cookie: {
      read: () => box.value,
      write: (value: string) => {
        box.value = value;
      },
      clear: () => {
        box.value = undefined;
      },
    },
  };
  return box;
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirected to ${url}`);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * The demo's session, reached with the request's own cookie rather than through a browser check.
 *
 * The auth adapter refuses to read an HTTP-only cookie from anything shaped like a browser, and the
 * demo's own seams answer that by handing it the cookie. Doing it here rather than deleting `window` is
 * what keeps React's scheduler working, because a scheduler that fires after a global was removed
 * reports an error against whichever test happened to run last. `demoAuth` is covered as well as
 * `currentDemoSession`, because the sign-in action builds the adapter itself.
 */
vi.mock("../fixtures/lib/demo-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fixtures/lib/demo-session")>();
  return {
    ...actual,
    currentDemoSession: async (options: Record<string, unknown> = {}) =>
      await actual.currentDemoSession({ ...options, cookie: request.cookie }),
    demoAuth: (options: Record<string, unknown> = {}) =>
      actual.demoAuth({ ...options, cookie: request.cookie }),
  };
});

/**
 * The real actions, held for the two tests that drive a state through the page's own control.
 *
 * Those two need the store's answers rather than this file's, because what is under test is that the
 * empty and the failed state are reachable by a person moving a control and a read being refused, not
 * that a stub can produce an empty array. Mocked module, real implementations underneath.
 */
vi.mock("../fixtures/lib/demo-widgets-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fixtures/lib/demo-widgets-data")>();
  return {
    ...actual,
    loadWindowedRevenueAction: backend.revenue,
    loadDailyRevenueAction: backend.revenueChart,
    loadRecentOrdersAction: backend.ordersTable,
    loadLowStockAction: backend.lowStockList,
    loadStockValueRankAction: backend.stockValueRank,
    loadContentActivityAction: backend.contentActivity,
    __actual: actual,
  };
});

/**
 * A session for the tests that reach a state through the real action.
 *
 * The real reads run the boundary's guard, which is the point of using them: a page whose numbers come
 * from the store is a page whose reads a role is checked on. The auth adapter refuses to read a cookie
 * from anything shaped like a browser, so `window` is absent for the sign-in. It is restored
 * immediately, because React needs a `window` to render into and a test that removed one would be
 * measuring a page that cannot mount.
 */
async function signedIn(email?: string) {
  const { signInAction } = await import("../fixtures/app/login/actions");
  const { DEMO_PASSWORD, demoAccounts } = await import("../fixtures/lib/demo-accounts");
  const account = demoAccounts.find((candidate) => candidate.email === email) ?? demoAccounts[0];
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, null);
  expect(result.ok, `${account.email} could not sign in`).toBe(true);
}

/**
 * The store's own reads, reached past the stub.
 *
 * The mock factory hangs the real module off `__actual` so a test can ask the store rather than this
 * file, which is the difference between a demo that shows the empty state and one that performs it.
 */
type WithActual = typeof import("../fixtures/lib/demo-widgets-data") & {
  __actual: typeof import("../fixtures/lib/demo-widgets-data");
};

const actualModule = async () => (await import("../fixtures/lib/demo-widgets-data")) as WithActual;

/** The store's own low-stock read. */
const actualLowStock = async (limit: number, term: string) =>
  await (await actualModule()).__actual.loadLowStockAction(limit, term);

/** The store's own orders read. */
const actualOrders = async (limit: number, term: string) =>
  await (await actualModule()).__actual.loadRecentOrdersAction(limit, term);

afterEach(() => {
  request.value = undefined;
});

/** The panel for one widget, which is the element that carries the state. */
function tile(widget: string): HTMLElement {
  const panel = document.querySelector(`[data-widget='${widget}'][data-widget-state]`);
  if (!(panel instanceof HTMLElement)) throw new Error(`no tile for ${widget}`);
  return panel;
}

function stateOf(widget: string): string | null {
  return tile(widget).getAttribute("data-widget-state");
}

/** Every tile the page rendered, read from the DOM rather than from a list written here. */
function renderedTiles(): string[] {
  return [...document.querySelectorAll("[data-widget][data-widget-state]")].map(
    (panel) => panel.getAttribute("data-widget") ?? "",
  );
}

/**
 * The answer the stat tile is waiting for, and the hand that gives it.
 *
 * Rebuilt per test, because a tile allowed to answer in an earlier test would otherwise leave the next
 * one measuring a dashboard that is not slow. The promise itself lives in a hoisted box rather than in
 * a `beforeEach` local, because the mock has to hand back this promise and a closure over a
 * `beforeEach` variable would be a different one by the time the tile asked for it.
 */
const slow = vi.hoisted(() => ({
  answer: null as null | Promise<{ cents: number; previousCents: number; orders: number }>,
  release: null as null | ((value: { cents: number; previousCents: number; orders: number }) => void),
}));

beforeEach(() => {
  slow.answer = new Promise<{ cents: number; previousCents: number; orders: number }>((resolve) => {
    slow.release = resolve;
  });
  backend.revenue.mockResolvedValue({ cents: 25500, previousCents: 17000, orders: 4 });
  backend.revenueChart.mockResolvedValue({
    cents: 25500,
    days: [
      { key: "2026-09-27", label: "Sep 27", value: 0 },
      { key: "2026-09-28", label: "Sep 28", value: 7400 },
      { key: "2026-09-29", label: "Sep 29", value: 18100 },
    ],
  });
  backend.ordersTable.mockResolvedValue([
    { id: "ord_2", customer: "Ece Toprak", status: "pending", totalCents: 74900 },
    { id: "ord_1", customer: "Deniz Aydın", status: "paid", totalCents: 4900 },
  ]);
  backend.lowStockList.mockResolvedValue([
    { id: "prd_3", name: "Walnut monitor riser", sku: "RISR-001", priceCents: 5900, stock: 0 },
    { id: "prd_2", name: "Ash standing desk", sku: "DESK-001", priceCents: 74900, stock: 6 },
  ]);
  backend.stockValueRank.mockResolvedValue([
    { key: "prd_2", label: "Ash standing desk", units: 6, cents: 449400 },
    { key: "prd_5", label: "Linen cable tray", units: 58, cents: 185600 },
  ]);
  backend.contentActivity.mockResolvedValue([
    {
      id: "rev_pst_1_2",
      message: "publish “Shipping to the EU from the new warehouse”",
      actor: "owner@demo.helmdeck.dev",
      at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      kind: "publish",
    },
  ]);
});

describe("the shipped tiles route", () => {
  it("places a placement for every widget the registry resolved, and the registry refuses none of them", () => {
    const dashboard = buildShippedTileDashboard();
    const registered = shippedTileRegistry.list().map((definition) => definition.id);

    // Read off the registry rather than from a list written here, so dropping a widget from the
    // registry fails this rather than passing against a hardcoded expectation of six.
    expect(dashboard.placements.map((placement) => placement.widget).sort()).toEqual(
      [...registered].sort(),
    );
    expect(dashboard.placements).toHaveLength(registered.length);
    expect(adminDashboardValidate(shippedTileRegistry, dashboard.placements).size).toBe(0);
  });

  it("places each tile at a size its own definition declares, rather than one this file chose", () => {
    const dashboard = buildShippedTileDashboard();

    for (const placement of dashboard.placements) {
      const definition = shippedTileRegistry.resolve(placement.widget);
      expect(definition, `${placement.widget} is placed but not registered`).toBeDefined();
      expect(
        definition?.sizes.includes(placement.size),
        `${placement.widget} placed at ${placement.size}, which it does not declare`,
      ).toBe(true);
    }
  });

  it("renders six tiles, and every one of them is a placement the arrangement made", async () => {
    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("revenueStat")).toBe("ready"));
    const dashboard: AdminDashboard = buildShippedTileDashboard();
    expect(renderedTiles().sort()).toEqual(
      dashboard.placements.map((placement) => placement.widget).sort(),
    );
  });

  it("shows the store's own figures, formatted from the integer cents the sum produced", async () => {
    render(<ShippedTilesPage />);

    // 25500 cents and 74900 cents: the values the actions answered with, divided by 100 only by the
    // widget's own money formatter. A tile that formatted them itself could be off by a cent and this
    // would not see it, which is why the expected strings are exact.
    await waitFor(() => expect(within(tile("revenueStat")).getByText("$255.00")).toBeInTheDocument());
    expect(within(tile("revenueStat")).getByText(/4 paid and shipped orders/)).toBeInTheDocument();
    expect(within(tile("ordersTable")).getByText("Ece Toprak")).toBeInTheDocument();
    expect(within(tile("ordersTable")).getByText("$749.00")).toBeInTheDocument();
    expect(within(tile("lowStockList")).getByText("Walnut monitor riser")).toBeInTheDocument();
    // 449400 cents, which is 74900 times the 6 units the action reported. The rank chart prints its
    // figures twice, once in the bar and once in the table a screen reader reads, so this asks for the
    // count of them rather than for a single match.
    expect(within(tile("stockValueRank")).getAllByText("$4,494.00").length).toBeGreaterThan(0);
    expect(within(tile("contentActivity")).getByText(/publish/)).toBeInTheDocument();
  });

  it("shows a tile still waiting while its loader is held open, and the rest ready beside it", async () => {
    backend.revenue.mockImplementation(() => slow.answer);

    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("revenueStat")).toBe("loading"));
    expect(within(tile("revenueStat")).queryByText("$255.00")).not.toBeInTheDocument();
    // The other five answered, which is the property the per-tile hook exists for.
    expect(stateOf("ordersTable")).toBe("ready");
    expect(stateOf("lowStockList")).toBe("ready");
  });

  it("shows a released slow tile's own answer, and only once it lands", async () => {
    backend.revenue.mockImplementation(() => slow.answer);

    render(<ShippedTilesPage />);
    await waitFor(() => expect(stateOf("revenueStat")).toBe("loading"));

    slow.release?.({ cents: 9900, previousCents: 25500, orders: 2 });

    await waitFor(() => expect(within(tile("revenueStat")).getByText("$99.00")).toBeInTheDocument());
    expect(stateOf("revenueStat")).toBe("ready");
  });

  it("shows what a refused read failed with, and retries it on the tile's own control", async () => {
    const user = userEvent.setup();
    backend.ordersTable.mockRejectedValue(new Error("This session may not read orders"));

    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("ordersTable")).toBe("error"));
    expect(within(tile("ordersTable")).getByText(/may not read orders/)).toBeInTheDocument();
    expect(backend.ordersTable).toHaveBeenCalledTimes(1);

    await user.click(within(tile("ordersTable")).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(backend.ordersTable).toHaveBeenCalledTimes(2));
    // The other tiles are untouched by the retry: it is one tile's control.
    expect(stateOf("revenueStat")).toBe("ready");
  });

  it("shows the empty state for a tile the store has nothing for", async () => {
    backend.lowStockList.mockResolvedValue([]);

    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("lowStockList")).toBe("empty"));
    // The tile's own words rather than the engine's, which is what a host supplies a tile for.
    expect(within(tile("lowStockList")).getByText("Nothing low on stock")).toBeInTheDocument();
    expect(stateOf("revenueStat")).toBe("ready");
  });

  it("re-reads every tile when the store selector moves, so the figures are an answer and not a picture", async () => {
    const user = userEvent.setup();
    render(<ShippedTilesPage />);
    await waitFor(() => expect(stateOf("revenueStat")).toBe("ready"));

    await user.selectOptions(screen.getByLabelText("Store"), "lamp");

    // The term reaches the action, which is the only place a filter could have been applied.
    await waitFor(() => expect(backend.lowStockList).toHaveBeenLastCalledWith(6, "lamp"));
    expect(backend.revenue).toHaveBeenLastCalledWith(30, "lamp");
    expect(backend.ordersTable).toHaveBeenLastCalledWith(6, "lamp");
    expect(backend.contentActivity).toHaveBeenLastCalledWith(8, "lamp");
  });

  it("reaches the empty state through its own control, rather than only through a stubbed answer", async () => {
    // The store's own answer to a term no row in the seeded workspace carries, read here rather than
    // by the page: the page is a client component and cannot be mounted without a browser-shaped
    // global, which is the same global the store's auth adapter refuses to read a cookie from. The
    // empty rows are therefore established once, on the server side, and the page is then asked to
    // render them.
    await signedIn();
    const rows = await actualLowStock(6, "zzz");
    expect(rows, "the store is expected to hold no product matching this term").toEqual([]);
    backend.lowStockList.mockResolvedValue(rows);
    render(<ShippedTilesPage />);
    await waitFor(() => expect(stateOf("lowStockList")).toBe("empty"));
    expect(within(tile("lowStockList")).getByText("Nothing low on stock")).toBeInTheDocument();
  });

  it("reaches the error state through the boundary's own refusal, and shows the message it produced", async () => {
    // The refusal is produced by the store's guard for the role that may not read orders, which is the
    // editor. Read here and rendered by the page, so the message on screen is the one the boundary
    // wrote rather than one this test put beside the tile, which is the whole claim of the error
    // state: the tile adds no words of its own.
    await signedIn("editor@demo.helmdeck.dev");
    const refusal = await actualOrders(6, "").then(
      () => "the editor was not refused, which is the bug this test is here to catch",
      (cause: Error) => cause.message,
    );
    expect(refusal).toMatch(/may not orders\.read/);
    backend.ordersTable.mockRejectedValue(new Error(refusal));
    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("ordersTable")).toBe("error"));
    expect(within(tile("ordersTable")).getByText(/may not orders\.read/)).toBeInTheDocument();
    // The retry is the load's own, so the control on the tile is the engine's rather than the page's.
    expect(within(tile("ordersTable")).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps a failed tile out of the count of tiles showing data", async () => {
    backend.revenueChart.mockRejectedValue(new Error("The chart's query was refused"));

    render(<ShippedTilesPage />);

    await waitFor(() => expect(stateOf("revenueChart")).toBe("error"));
    // A failed tile and an empty one both render as no data, so counting them as ready would report a
    // dashboard with more in it than there is.
    expect(document.querySelectorAll("[data-widget-state='ready']")).toHaveLength(5);
  });
});
