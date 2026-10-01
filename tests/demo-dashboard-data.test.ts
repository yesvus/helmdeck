// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import { queryResourceAction } from "../fixtures/lib/resource-actions";
import {
  loadAverageOrderValueAction,
  loadCatalogAction,
  loadPendingOrdersAction,
  loadReorderAction,
  loadRevenueAction,
  loadSignupCountAction,
} from "../fixtures/lib/dashboard-data";

/**
 * The request, stood in for.
 *
 * A dashboard widget is a promise the browser awaits, so the only way to reach the code behind one is
 * to call the action the widget calls. `next/headers` is the seam, and it is the same one
 * `demo-auth.test.ts` stands in for: the cookie the session lives in is the request's, so a test
 * that signs in through the published action and then calls a dashboard action is standing where a
 * signed-in visitor stands.
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

const [owner] = demoAccounts;

async function signIn() {
  // The published credentials, through the action the login form calls, rather than a session row
  // written by hand: a test that invents a session is not standing where a visitor stands.
  const result = await signInAction({ email: owner.email, password: DEMO_PASSWORD }, null);
  expect(result.ok).toBe(true);
}

beforeEach(async () => {
  guard.calls.length = 0;
  request.session = undefined;
  // The adapter refuses to read next/headers from anything that looks like a browser, so the
  // actions are exercised with the same absence a server action has.
  vi.stubGlobal("window", undefined);
  await signIn();
  // Seeding is memoised per process, so the first dashboard read pays for it. Doing it here rather
  // than inside a test that measures elapsed time keeps the timer arithmetic honest.
  await loadCatalogAction();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * The numbers a visitor sees, derived by hand from the seeded workspace.
 *
 * The store holds five products and 110 units: 34 + 6 + 0 + 12 + 58. Money is the four orders the
 * store has been paid for, 4900 + 3200 + 12500 + 4900 = 25500 cents, which is the average of 6375.
 * Two orders are excluded because nobody has paid for them: one is pending, one was cancelled.
 */
describe("the aggregates the dashboard shows", () => {
  it("counts the rows the store holds, so the tile cannot report a number the store has never seen", async () => {
    const catalog = await loadCatalogAction();

    expect(catalog).toEqual({ products: 5, units: 110 });
  });

  it("sums the money in cents as an integer, and never over a formatted string", async () => {
    const revenue = await loadRevenueAction();

    // An integer, which is what makes the total independent of how any one row was written.
    expect(Number.isInteger(revenue.cents)).toBe(true);
    expect(revenue).toEqual({ cents: 25500, orders: 4 });
  });

  it("leaves out an order nobody has paid for, and one that was cancelled", async () => {
    const revenue = await loadRevenueAction();
    const all = await queryResourceAction("orders");

    // Six rows in the store, four of them money the store has. A total over every row would be a
    // number the ledger does not agree with.
    expect(all).toHaveLength(6);
    expect(revenue.orders).toBe(4);
    expect(revenue.cents).toBeLessThan(25500 + 74900);
  });

  it("asks the store for the pending orders rather than counting them in the demo", async () => {
    expect(await loadPendingOrdersAction()).toEqual({ pending: 1 });
  });

  it("lists the products below the level the widget states, thinnest stock first", async () => {
    const reorder = await loadReorderAction(10);

    expect(reorder).toEqual([
      { name: "Walnut monitor riser", sku: "RISR-001", stock: 0 },
      { name: "Ash standing desk", sku: "DESK-001", stock: 6 },
    ]);
  });

  it("waits on a slow query before it answers, and then answers with the same money", async () => {
    // The loading state a visitor sees is the delay, not a status somebody wrote into a map. Two
    // seconds of clock have to leave the tile waiting, or the widget's slow state is a costume.
    vi.useFakeTimers();
    let settled = false;
    const pending = loadAverageOrderValueAction().then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ cents: 6375, orders: 4 });
  });
});

/**
 * The dashboard is a second way into the store unless it goes through the same checks, so what it
 * will and will not answer for is asserted here rather than read off a page.
 */
describe("a dashboard read is not a way around the boundary", () => {
  it("refuses the accounts table for a signed-in administrator, and says why", async () => {
    // The signups tile's failure is this refusal. A boundary the dashboard could step over would put
    // password hashes and session rows behind a tile.
    await expect(loadSignupCountAction()).rejects.toThrow(
      '"users" is not a resource this admin exposes',
    );
  });

  it("refuses the session rows through the same action the widgets call", async () => {
    await expect(queryResourceAction("sessions")).rejects.toThrow(
      '"sessions" is not a resource this admin exposes',
    );
  });

  it("sends an anonymous caller to the login page rather than answering", async () => {
    request.session = undefined;

    await expect(loadCatalogAction()).rejects.toThrow(guard.RedirectSignal);
    expect(guard.calls).toHaveLength(1);
  });
});
