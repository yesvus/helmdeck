// SPDX-License-Identifier: MIT
"use client";

/**
 * The six shipped tiles, placed by the engine and rendered through its layout.
 *
 * A client component, and the reason is the data rather than the drawing. Every figure arrives through
 * a server action, because the store's connection is configured from environment variables that must
 * never reach a browser bundle. The six tiles are therefore declared in the registry, placed through
 * `adminDashboardAddPlacement`, and rendered through `AdminDashboardLayout` with a resolved state each;
 * a page that handed a widget straight to a renderer would prove nothing about whether a host can
 * register and place one.
 *
 * The states come from the engine's own per-tile hook, one call per tile rather than a loop over them.
 * A varying number of hooks in one component is what the rules of hooks forbid, and it misaligns
 * silently when a tile is added, so the six are written out and the arrangement is what decides which
 * of them a placement shows. That also means the search can change a tile's query: a loader that
 * closes over the term gets a new identity when the term moves, and the hook reloads, which is what
 * makes a figure on this page an answer rather than a picture.
 *
 * The four states are the engine's, and none of the six tiles claims the error one. A failed load
 * shows the engine's own message with the load's own `refetch` behind the button, which is the design
 * rather than an oversight: a tile printing a sentence of its own about a failure is one more place
 * for that sentence to be wrong.
 *
 * The session check is in the segment layout above this route, not here, so a request without one is
 * turned away before this page renders. What this page does check is the permission rule, and it does
 * so by reading the store through the same actions every other page uses: an editor cannot read
 * `orders`, so the three order tiles are the boundary's refusal and the three product and content
 * tiles render.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AdminDashboardLayout,
  adminDashboardValidate,
  useAdminWidgetData,
  type AdminDashboard,
  type AdminDashboardPlacement,
  type AdminWidgetState,
} from "@yesvus/helmdeck";
import {
  loadContentActivityAction,
  loadDailyRevenueAction,
  loadLowStockAction,
  loadRecentOrdersAction,
  loadStockValueRankAction,
  loadWindowedRevenueAction,
} from "../../../lib/demo-widgets-data";
import {
  TILE_CHART_DAYS,
  TILE_FEED_ROWS,
  TILE_LIST_ROWS,
  TILE_TABLE_ROWS,
  TILE_WINDOW_DAYS,
  contentActivityWidget,
  dailyRevenueChartWidget,
  lowStockListWidget,
  recentOrdersTableWidget,
  revenueStatWidget,
  shippedTileRegistry,
  stockValueRankWidget,
} from "./registry";
import { buildShippedTileDashboard } from "./arrangement";

/**
 * The store's own vocabulary, offered as choices.
 *
 * The last one matches nothing on purpose: it is the only way a person can reach the empty state
 * without emptying a table, and a demo that cannot show a state it ships is a demo of the happy path
 * only.
 */
const STORES = [
  { value: "", label: "Everything in the store" },
  { value: "deniz", label: "Orders from Deniz" },
  { value: "paid", label: "Paid orders" },
  { value: "lamp", label: "Lamps" },
  { value: "shipping", label: "Posts about shipping" },
  { value: "zzz", label: "Nothing at all" },
];

/** The arrangement this page renders. Built once, because it is a fact about the build. */
const dashboard: AdminDashboard = buildShippedTileDashboard();

export default function ShippedTilesPage() {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();

  const revenueStat = useAdminWidgetData({
    definition: revenueStatWidget,
    load: useCallback(async () => await loadWindowedRevenueAction(TILE_WINDOW_DAYS, term), [term]),
  });
  const revenueChart = useAdminWidgetData({
    definition: dailyRevenueChartWidget,
    load: useCallback(async () => await loadDailyRevenueAction(new Date(), TILE_CHART_DAYS, term), [term]),
  });
  const ordersTable = useAdminWidgetData({
    definition: recentOrdersTableWidget,
    load: useCallback(async () => await loadRecentOrdersAction(TILE_TABLE_ROWS, term), [term]),
  });
  const lowStockList = useAdminWidgetData({
    definition: lowStockListWidget,
    load: useCallback(async () => await loadLowStockAction(TILE_LIST_ROWS, term), [term]),
  });
  const stockValueRank = useAdminWidgetData({
    definition: stockValueRankWidget,
    load: useCallback(async () => await loadStockValueRankAction(term), [term]),
  });
  const contentActivity = useAdminWidgetData({
    definition: contentActivityWidget,
    load: useCallback(async () => await loadContentActivityAction(TILE_FEED_ROWS, term), [term]),
  });

  /**
   * The six tiles, keyed by the widget the arrangement names them under.
   *
   * A plain object rather than an array, because the layout is handed a map keyed by placement id and
   * an array would need a lookup that could be answered with the wrong tile. The state is widened to
   * the erased type the layout takes, which is the one place the six data types meet.
   */
  const tiles: Record<string, TileData> = {
    revenueStat,
    revenueChart,
    ordersTable,
    lowStockList,
    stockValueRank,
    contentActivity,
  };

  /**
   * Each placement's state, keyed the way the layout reads it.
   *
   * Matched by the widget the placement names rather than by a hardcoded placement id, because a
   * placement's id is whatever the arrangement engine gave it. A placement naming a widget this page
   * holds no hook for is left out of the map, and the layout reports a tile still waiting rather than
   * rendering one with nothing behind it.
   */
  const states: Readonly<Record<string, AdminWidgetState<unknown>>> = Object.fromEntries(
    dashboard.placements.flatMap((placement) => {
      const tile = tileFor(placement.widget, tiles);
      return tile ? [[placement.id, tile.state]] : [];
    }),
  );

  const onRetry = useCallback(
    (placement: AdminDashboardPlacement) => tileFor(placement.widget, tiles)?.refetch(),
    // The tiles are a fresh object each render, so keying on it would hand the layout a new retry
    // every render. The refetches themselves are stable, and the placement is what selects one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      revenueStat.refetch,
      revenueChart.refetch,
      ordersTable.refetch,
      lowStockList.refetch,
      stockValueRank.refetch,
      contentActivity.refetch,
    ],
  );

  const problems = adminDashboardValidate(shippedTileRegistry, dashboard.placements);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-900">Shipped tiles</h1>
          <p className="text-sm text-zinc-500">
            The six tiles the package ships, placed through the engine and drawn from what the store
            holds. Every figure is read through the same server actions the product and order pages use,
            so an editor sees this page refuse the three order tiles and read the rest.
          </p>
        </div>
        <label className="text-sm font-medium text-zinc-700">
          Store
          <select
            aria-label="Store"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ml-2 rounded-admin-control border border-zinc-300 bg-admin-surface px-3 py-2"
          >
            {STORES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <AdminDashboardLayout
        registry={shippedTileRegistry}
        placements={dashboard.placements}
        states={states}
        onRetry={onRetry}
      />

      <section className="rounded-admin-card border border-dashed border-admin-border bg-admin-surface p-5">
        <h2 className="text-sm font-semibold text-zinc-900">
          The arrangement is checked against the registry, not against a list written here
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {dashboard.placements.length} placements and {problems.size} the registry refuses.{" "}
          {dashboard.placements.filter((placement) => !shippedTileRegistry.resolve(placement.widget))
            .length}{" "}
          name a widget this build does not register.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          The demo&apos;s own dashboard is still at{" "}
          <Link href="/dashboard" className="font-semibold text-admin-brand-text hover:underline">
            /dashboard
          </Link>
          , built from hand-written widgets rather than these.
        </p>
      </section>
    </div>
  );
}

/**
 * What the layout needs from a tile, rather than what the hook returns.
 *
 * The six hooks answer six different data types, and a layout holds widgets of many types at once. So
 * the map is built from the state and the retry alone, which are the same shape for every one of them,
 * and the erasure happens here rather than being pushed onto the hook's own generic.
 */
type TileData = {
  state: AdminWidgetState<unknown>;
  refetch: () => void;
};

/** The tile's own entry, or null for a widget this page holds no hook for. */
function tileFor(widget: string, tiles: Record<string, TileData>): TileData | null {
  return tiles[widget] ?? null;
}
