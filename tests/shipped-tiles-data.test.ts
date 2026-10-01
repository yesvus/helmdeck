// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction } from "../fixtures/app/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { queryResourceAction } from "../fixtures/lib/resource-actions";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import {
  loadContentActivityAction,
  loadDailyRevenueAction,
  loadLowStockAction,
  loadRecentOrdersAction,
  loadStockValueRankAction,
  loadWindowedRevenueAction,
} from "../fixtures/lib/demo-widgets-data";

/**
 * The tiles' reads, over the real store, as a signed-in visitor.
 *
 * Every call here is the published action the browser would post to, with the session the signed
 * cookie resolves to and nothing else. A tile's number is only honest if the query behind it is, so
 * the assertions are against rows the store holds rather than against figures written beside the
 * expectation: a page that stopped reading the database would answer with something the seeded
 * workspace does not contain, and this fails.
 *
 * The role half is the same seam. The three order tiles read `orders`, which the rule reserves to
 * administrators, so a test that signed in as the editor and read them anyway would be testing a page
 * that has become a way around the rule rather than a page that enforces it.
 */

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {}
  return { RedirectSignal, calls: [] as string[] };
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
    guard.calls.push(url);
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;

async function signIn(account: typeof owner) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, null);
  expect(result.ok, `${account.email} could not sign in`).toBe(true);
}

/** What the store holds, read through the same action the tiles read through. */
async function rowsOf(resource: string): Promise<Record<string, unknown>[]> {
  return (await queryResourceAction(resource)) as Record<string, unknown>[];
}

/**
 * A moment on every order, written through the store.
 *
 * The seed writes orders with no `created_at`, and the memory adapter has no column defaults, so a
 * seeded order genuinely has no time on it. A time-windowed read cannot be measured against a row that
 * cannot be placed in time, so the tests about windows stamp one first. The tests about what the store
 * holds leave the rows as they are, because that is the shape a visitor's demo has.
 *
 * The whole row goes back, because the memory adapter replaces a record outright rather than merging
 * into it. Sending only the new column would blank the status and the total, and the tile would then
 * be measured against a store this test had emptied.
 */
async function dateEveryOrder(at: string = new Date().toISOString()): Promise<void> {
  for (const order of await store.query<Record<string, unknown>>("orders")) {
    await store.update("orders", String(order.id), { ...order, created_at: at });
  }
}

/**
 * The seeded orders, with no moment on them, which is the shape the seed writes.
 *
 * The store is one per process and these tests share it, so a test that dated an order would leave the
 * next one measuring a workspace the visitor's demo does not have. Restoring the shape is what makes
 * each test's starting point the same one the page will meet. Read through the adapter rather than
 * through the resource action, because this runs before a session exists and the action is the thing
 * that would refuse.
 */
async function undateEveryOrder(): Promise<void> {
  for (const order of await store.query<Record<string, unknown>>("orders")) {
    const undated: Record<string, unknown> = { ...order };
    delete undated.created_at;
    await store.update("orders", String(order.id), undated);
  }
}

beforeEach(async () => {
  guard.calls.length = 0;
  request.session = undefined;
  // The adapter refuses to read next/headers from anything shaped like a browser, so the actions are
  // exercised with the same absence a server action has.
  vi.stubGlobal("window", undefined);
  await ensureDemoSeeded();
  await undateEveryOrder();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The seeded workspace, restated from the rows rather than from a copy of the seed.
 *
 * Five products and 110 units, six orders of which four are paid or shipped, and 25500 cents of money
 * in. Every figure below is read from the store at the top of each test, so a seed that changes fails
 * here rather than quietly making the assertions wrong.
 */
describe("the reads behind the shipped tiles", () => {
  it("sums the money the store has actually taken, in integer cents", async () => {
    await signIn(owner);
    await dateEveryOrder();
    const orders = await rowsOf("orders");
    const earned = orders.filter((order) => order.status === "paid" || order.status === "shipped");

    const figure = await loadWindowedRevenueAction(3650, "");

    // The window is wide enough to hold every order whatever the store stamped them with, so the
    // answer is the whole of it and the pending and cancelled orders are excluded by name rather
    // than by a rule the test wrote.
    expect(figure.cents).toBe(earned.reduce((total, order) => total + Number(order.total_cents), 0));
    expect(figure.orders).toBe(earned.length);
    // A pending order is money nobody has paid for and a cancelled one never was, so neither is in it.
    expect(earned).toHaveLength(4);
    expect(figure.cents).toBe(25500);
  });

  it("keeps cents an integer through the sum rather than building a total from a formatted amount", async () => {
    await signIn(owner);
    await dateEveryOrder();

    const figure = await loadWindowedRevenueAction(3650, "");

    // A total assembled by adding dollars would be a different number from the one the ledger holds,
    // and it would read correctly on screen while being wrong.
    expect(Number.isInteger(figure.cents)).toBe(true);
    expect(figure.cents).toBe(25500);
  });

  it("divides the two windows between them rather than counting an order twice", async () => {
    await signIn(owner);
    const orders = await rowsOf("orders");
    await dateEveryOrder();
    // One *paid* order moved into the earlier window, so the trend has something to be a trend of. A
    // cancelled order would not do: it is money nobody ever took, so the total filters it out before
    // the windows are split and moving it would change nothing.
    const moved = orders.find((order) => order.id === "ord_4" && order.status === "paid");
    expect(moved).toBeDefined();
    await store.update("orders", String(moved?.id), {
      ...moved,
      created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    });

    const figure = await loadWindowedRevenueAction(30, "");

    // 25500 less the 12500 that moved: 4900 + 3200 + 4900 in the window, 12500 before it. A sum that
    // counted every order twice would put more in the recent figure than the store holds in all.
    expect(figure.cents).toBe(13000);
    expect(figure.previousCents).toBe(12500);
    expect(figure.orders).toBe(3);
  });

  it("leaves an order the store cannot date out of both windows, rather than filing it under the epoch", async () => {
    await signIn(owner);
    const orders = await rowsOf("orders");
    // The memory store has no column defaults, so this is the shape a seeded order really has: a
    // total and a status with no moment at all.
    const undated = orders.find((order) => order.created_at === undefined);
    expect(undated, "the store's rows are expected to carry no timestamp").toBeDefined();
    expect((await loadWindowedRevenueAction(3650, "")).cents).toBe(0);

    // With every order dated, the same read finds the money, so the zero above was the rows and not
    // the sum.
    await dateEveryOrder();
    expect((await loadWindowedRevenueAction(3650, "")).cents).toBe(25500);
  });

  it("orders the table by the money it shows, so the largest order is the first row", async () => {
    await signIn(owner);
    const orders = await rowsOf("orders");
    const expected = [...orders]
      .map((order) => ({ id: String(order.id), total: Number(order.total_cents) }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 6);

    const table = await loadRecentOrdersAction(6, "");

    expect(table.map((order) => order.id)).toEqual(expected.map((order) => order.id));
    // ord_2 is the $749.00 one, so the sort is checked against the store rather than against a number
    // this file could have got wrong in the same way the action did.
    expect(table[0].totalCents).toBe(74900);
  });

  it("orders the list by the emptiest shelf, and leaves the tie-break to the name", async () => {
    await signIn(owner);
    const products = await rowsOf("products");
    const stocks = products.map((product) => Number(product.stock));
    const expected = [...stocks].sort((left, right) => left - right);

    const list = await loadLowStockAction(6, "");

    expect(list.map((product) => product.stock)).toEqual(expected);
    expect(list[0].stock).toBe(Math.min(...stocks));
    // The store holds nothing, so the tile's empty state is reachable without emptying a table.
    expect(stocks).toContain(0);
  });

  it("ranks the catalog by retail value, which is a different order from the emptiest shelf", async () => {
    await signIn(owner);
    const products = await rowsOf("products");
    const expected = products
      .map((product) => ({
        id: String(product.id),
        value: Number(product.price_cents) * Number(product.stock),
      }))
      .sort((left, right) => right.value - left.value);

    const ranked = await loadStockValueRankAction("");

    expect(ranked.map((product) => product.key)).toEqual(expected.map((product) => product.id));
    // 74900 times 6 is the standing desk, and it is both the emptiest shelf and the largest holding,
    // which is why the second element is checked as well: a rank that ignored the multiplication would
    // order these two the same way by accident.
    expect(ranked[0].cents).toBe(449400);
    expect(ranked[1].cents).toBe(185600);
  });

  it("gives the chart a point for every day in the range, so a day with no sales is a zero", async () => {
    await signIn(owner);
    // The orders are dated from this clock and the range ends on the same one. A hard-coded end date
    // beside a `new Date()` default is a test that passes until the calendar crosses it: this one held
    // through 30 September and failed on 1 October, when every order fell outside the window and the
    // single carrying day became none.
    const now = new Date();
    await dateEveryOrder(now.toISOString());
    const end = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

    const chart = await loadDailyRevenueAction(end, 30, "");

    expect(chart.days).toHaveLength(30);
    // The first, second-last and last days of the range, named from the range rather than written out,
    // so the assertion describes the window instead of three dates that quietly stop being its edges.
    const dayKey = (offset: number) =>
      new Date(end.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    expect(chart.days.map((day) => day.key)).toEqual(
      expect.arrayContaining([dayKey(29), dayKey(1), dayKey(0)]),
    );
    expect(chart.days[0].key).toBe(dayKey(29));
    expect(chart.days[29].key).toBe(dayKey(0));
    // A chart built from the rows alone would have one point per order and would draw a straight line
    // across the days that hold nothing.
    expect(chart.days.every((day) => Number.isFinite(day.value))).toBe(true);
    // The four earned orders all landed on the day the range ends, so exactly one day carries money and
    // the other twenty-nine are zeros rather than holes.
    const carrying = chart.days.filter((day) => day.value > 0);
    expect(carrying).toHaveLength(1);
    expect(carrying[0].key).toBe(end.toISOString().slice(0, 10));
    expect(chart.cents).toBe(25500);
  });

  it("answers with a flat range rather than an empty one when the store holds nothing in it", async () => {
    await signIn(owner);
    await dateEveryOrder();
    // A range that ends before every order was placed. Every day in it is a real day with no money on
    // it, which is a fact rather than a gap, and the chart tile draws it flat instead of hiding it.
    const longAgo = new Date(Date.now() - 365 * 86_400_000);

    const chart = await loadDailyRevenueAction(longAgo, 7, "");

    expect(chart.days).toHaveLength(7);
    expect(chart.days.every((day) => day.value === 0)).toBe(true);
    expect(chart.cents).toBe(0);
  });

  it("reads the activity feed from the revisions the store recorded, and from nothing else", async () => {
    await signIn(owner);
    const revisions = await store.query("post_revisions");

    const events = await loadContentActivityAction(8, "");

    // The demo seeds no revisions, so the feed is empty until somebody edits a post. That is the
    // store's answer rather than a fixture's: a feed of events that never happened would be a lie
    // about what the tile is for, and this is where that would show.
    expect(revisions).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it("answers with the revisions the store holds once a post has been changed", async () => {
    await signIn(owner);
    const { savePost } = await import("../fixtures/lib/demo-revisions");
    const posts = await rowsOf("posts");
    const post = posts[0];
    await savePost({ id: owner.id, email: owner.email, role: owner.role } as never, String(post.id), {
      title: "Shipping to the EU from the new warehouse",
      body: "Transit times drop to two days.",
    });

    const events = await loadContentActivityAction(8, "");

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("edit");
    expect(events[0].actor).toBe(owner.email);
    // The tile is given a real moment to date rather than a row it has to invent an event out of.
    expect(Number.isFinite(Date.parse(events[0].at))).toBe(true);
  });
});

describe("the filter the page offers reaches the store rather than the screen", () => {
  it("narrows the orders the table holds, so the term lands on a row the store has", async () => {
    await signIn(owner);
    const orders = await rowsOf("orders");
    const expected = orders.filter((order) => String(order.customer).toLowerCase().includes("deniz"));

    const table = await loadRecentOrdersAction(6, "deniz");

    expect(expected.length).toBeGreaterThan(0);
    expect(table).toHaveLength(expected.length);
    expect(table.map((order) => order.id)).toEqual(expected.map((order) => String(order.id)));
  });

  it("answers with nothing for a term the store does not hold, so the empty state is reachable", async () => {
    await signIn(owner);

    // No row in the seeded workspace carries this term, so every list and table answers with none.
    expect(await loadRecentOrdersAction(6, "zzz")).toEqual([]);
    expect(await loadLowStockAction(6, "zzz")).toEqual([]);
    expect(await loadStockValueRankAction("zzz")).toEqual([]);
  });

  it("narrows the products too, and leaves the orders alone when the term is a product name", async () => {
    await signIn(owner);
    const products = await rowsOf("products");
    const matched = products.filter((product) =>
      `${String(product.name)} ${String(product.sku)}`.toLowerCase().includes("lamp"),
    );
    // The list orders by the emptiest shelf rather than by the store's own row order, so the
    // expectation is sorted the same way. Comparing against the store's order would fail against a
    // correct sort and pass against a broken one.
    const expected = [...matched].sort(
      (left, right) => Number(left.stock) - Number(right.stock) || String(left.name).localeCompare(String(right.name)),
    );

    const list = await loadLowStockAction(6, "lamp");
    const table = await loadRecentOrdersAction(6, "lamp");

    expect(matched.length).toBeGreaterThan(1);
    expect(list.map((product) => product.id)).toEqual(expected.map((product) => String(product.id)));
    // No order mentions a lamp, so the orders table is empty for the same term. A search that reached
    // only the screen would leave the orders showing anyway.
    expect(table).toEqual([]);
  });
});

/**
 * The rule, asked at the server action rather than at the view.
 *
 * A hidden tile is not authorization, so nothing here renders. Every call is the action a browser
 * would post to with the session its signed cookie resolves to, which is the call an attacker makes
 * when the button is missing.
 */
describe("the role rules on the tiles page", () => {
  it("refuses the three order tiles for an editor, and the refusal is the rule's own message", async () => {
    await signIn(editor);

    // The boundary refuses before the store is reached, so these are the same refusals the resource
    // pages get rather than a check this page added. The message names the permission, because the
    // rule is what answered and a tile printing its own wording would be a second answer.
    await expect(loadWindowedRevenueAction(30, "")).rejects.toThrow(/may not orders\.read/);
    await expect(loadRecentOrdersAction(6, "")).rejects.toThrow(/may not orders\.read/);
    await expect(loadDailyRevenueAction(new Date(), 30, "")).rejects.toThrow(/may not orders\.read/);
  });

  it("still answers the three tiles an editor's role reaches", async () => {
    await signIn(editor);

    // Products and posts are reachable by both roles, so the other three tiles are the ones that
    // render for an editor rather than a page that is broken for half its audience.
    expect(await loadLowStockAction(6, "")).not.toEqual([]);
    expect(await loadStockValueRankAction("")).not.toEqual([]);
    expect(Array.isArray(await loadContentActivityAction(8, ""))).toBe(true);
  });

  it("answers the same three tiles for an administrator", async () => {
    await signIn(owner);
    await dateEveryOrder();

    expect((await loadWindowedRevenueAction(30, "")).cents).toBeGreaterThan(0);
    expect(await loadRecentOrdersAction(6, "")).not.toEqual([]);
    expect((await loadDailyRevenueAction(new Date(), 30, "")).days).toHaveLength(30);
  });

  it("refuses the content feed to a session nobody resolved, rather than answering with a revision", async () => {
    // No sign-in, so the session is absent rather than a role that lacks the permission. The feed
    // asks the rule about a post, and a session that is not there is not a session that may read one.
    await expect(loadContentActivityAction(8, "")).rejects.toThrow();
  });
});
