// SPDX-License-Identifier: MIT
"use client";

/**
 * The analytics page's loads, over the engine's own per-load hook.
 *
 * The engine already decides what a loading, a failed and a ready load look like, and re-deciding it
 * here would put a second answer to the same question on one page. So the page hands the hook a
 * loader and renders whatever `state` says, and the states a reader sees are the engine's states.
 *
 * `useAdminWidgetData` reloads whenever the load function's identity changes, so each loader is
 * built with the narrowest dependency list that still lets a control change what it asks for. A
 * loader with no dependencies re-queries nothing, and one closing over a value that changes every
 * render re-queries the host's database on every render, which is the failure the dashboard tiles
 * document and pass around with a ref. Only the range is a dependency here, so the select genuinely
 * re-reads the store and nothing else can.
 */

import { useCallback, useMemo } from "react";
import { useAdminWidgetData, type AdminWidgetDefinition } from "@yesvus/helmdeck";
import { loadAnalyticsTotalsAction, loadDailyRevenueAction, loadStockByProductAction } from "./data";
import type { AnalyticsTotals, DailyRevenue, RankedProducts } from "./types";

/**
 * A definition that renders nothing of its own.
 *
 * The chart components are the renderers, and what the engine needs from a definition here is
 * `isEmpty` plus a title for the error copy. Rendering through the definition would mean describing
 * the chart twice, once as a widget and once as a chart.
 */
function definitionFor<TData>(
  id: string,
  title: string,
  isEmpty: (data: TData) => boolean,
): AdminWidgetDefinition<TData> {
  return { id, title, sizes: ["lg"], isEmpty, render: () => null };
}

const revenueIsEmpty = (data: DailyRevenue) => data.days.every((day) => day.value === 0);
const stockIsEmpty = (data: RankedProducts) =>
  data.length === 0 || data.every((product) => product.units === 0);
const totalsAreEmpty = (data: AnalyticsTotals) => data.paidOrders === 0 && data.unitsInStock === 0;

export function useDailyRevenue(days: number) {
  const definition = useMemo(
    () => definitionFor("analytics.revenue", "Revenue by day", revenueIsEmpty),
    [],
  );
  // `days` is in the dependencies on purpose, and it is the reason this can be a real range: a
  // loader built once would keep reporting the width it was first given, and a select that changes
  // nothing is a control that lies.
  const load = useCallback(() => loadDailyRevenueAction(new Date(), days), [days]);
  return useAdminWidgetData({ definition, load });
}

export function useStockByProduct() {
  const definition = useMemo(
    () => definitionFor("analytics.stock", "Units in stock by product", stockIsEmpty),
    [],
  );
  // Wrapped rather than passed by name: the hook is keyed on the load function's identity, and a
  // server action reference is not something to hand to `useCallback` directly.
  const load = useCallback(() => loadStockByProductAction(), []);
  return useAdminWidgetData({ definition, load });
}

export function useAnalyticsTotals() {
  const definition = useMemo(
    () => definitionFor("analytics.totals", "Totals", totalsAreEmpty),
    [],
  );
  const load = useCallback(() => loadAnalyticsTotalsAction(), []);
  return useAdminWidgetData({ definition, load });
}
