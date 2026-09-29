// SPDX-License-Identifier: MIT

/**
 * The demo's widgets, declared once and without a client directive.
 *
 * Two graphs need them. The grid renders them in the browser, and the arrangement actions ask the
 * registry on the server whether a placement names a widget this build has and a size it supports,
 * which is how a save refuses something the grid could not lay out. A registry behind a client
 * directive cannot be asked there, and two copies of it would let the arranger accept a widget the
 * grid never renders.
 *
 * The widgets are genuinely different shapes of answer: a count, a filtered list, a money total
 * derived from cents, one that is slow because its query is, and one the boundary refuses. None of
 * them reports a number the store does not hold.
 */

import { createAdminWidgetRegistry, defineAdminWidget } from "@yesvus/helmdeck";

export type SignupCount = { total: number };
export type CatalogTotals = { products: number; units: number };
export type ReorderRow = { name: string; sku: string; stock: number };
export type ReviewQueue = { pending: number };
/** Cents, never a formatted amount: the sum is an integer and only the display divides it. */
export type MoneyTotal = { cents: number; orders: number };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** A product holding fewer than this is on the reorder list, and the widget says which level it used. */
export const REORDER_LEVEL = 10;

const big = "text-2xl font-semibold text-zinc-900";
const caption = "mt-1 text-xs text-zinc-500";

export const dashboardRegistry = createAdminWidgetRegistry({
  revenue: defineAdminWidget<MoneyTotal>({
    id: "revenue",
    title: "Revenue",
    sizes: ["lg", "xl"],
    isEmpty: (data) => data.orders === 0,
    render: (data) => (
      <>
        <p className={big}>{money.format(data.cents / 100)}</p>
        <p className={caption}>
          across {data.orders} paid and shipped {data.orders === 1 ? "order" : "orders"}
        </p>
      </>
    ),
  }),
  signups: defineAdminWidget<SignupCount>({
    id: "signups",
    title: "Signups this month",
    sizes: ["sm"],
    isEmpty: (data) => data.total === 0,
    render: (data) => <p className={big}>{data.total}</p>,
  }),
  catalog: defineAdminWidget<CatalogTotals>({
    id: "catalog",
    title: "Products in the catalog",
    sizes: ["sm"],
    isEmpty: (data) => data.products === 0,
    render: (data) => (
      <>
        <p className={big}>{data.products}</p>
        <p className={caption}>{data.units} units in stock</p>
      </>
    ),
  }),
  reorder: defineAdminWidget<ReorderRow[]>({
    id: "reorder",
    title: "Products to reorder",
    // Half width as well as a third, because a short list of products is the case where a person
    // reaches for the size control at all.
    sizes: ["sm", "md"],
    isEmpty: (rows) => rows.length === 0,
    render: (rows) => (
      <ul className="space-y-1 text-sm text-zinc-700">
        {rows.map((row) => (
          <li key={row.sku} className="flex justify-between gap-2">
            <span className="truncate">{row.name}</span>
            <span className="shrink-0 text-zinc-500">{row.stock} left</span>
          </li>
        ))}
        <li className="pt-1 text-xs text-zinc-500">Below {REORDER_LEVEL} in stock</li>
      </ul>
    ),
  }),
  reviewQueue: defineAdminWidget<ReviewQueue>({
    id: "reviewQueue",
    title: "Orders awaiting review",
    sizes: ["sm"],
    isEmpty: (data) => data.pending === 0,
    render: (data) => <p className={big}>{data.pending}</p>,
  }),
  averageOrder: defineAdminWidget<MoneyTotal>({
    id: "averageOrder",
    title: "Average order value",
    sizes: ["sm"],
    isEmpty: (data) => data.orders === 0,
    render: (data) => <p className={big}>{money.format(data.cents / 100)}</p>,
  }),
});
