// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminWidgetState } from "./registry.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

/**
 * Per-widget data, where one slow widget does not gate the page.
 *
 * The failure modes here are the whole design, because each one is silent when it is wrong:
 *
 * - **A refetch must not blank the widget.** A dashboard that empties itself on every background
 *   refresh is worse than one that is briefly out of date, so a refetch keeps showing the previous
 *   data and is marked stale.
 * - **A slow response must not overwrite a fast one.** Every load carries a sequence number and only
 *   the newest may commit, so two widgets racing, or a slow first load overtaken by a refetch, do not
 *   end with the older data on screen.
 * - **Unmounting mid-flight must be inert.** Setting state after unmount no longer warns in React, so
 *   the failure is not a warning but a leak and a possible update to the wrong tree, which is why the
 *   effect clears its own committed flag.
 * - **A rejected load must not become an unhandled rejection.** The error becomes the state, always.
 */
export type AdminWidgetDataState<TData> = AdminWidgetState<TData> & {
  /** True while showing previously loaded data that a refetch may replace. */
  stale?: boolean;
};

export type AdminWidgetLoader<TData> = (signal: AbortSignal) => Promise<TData>;

export type AdminWidgetData<TData> = {
  state: AdminWidgetDataState<TData>;
  refetch: () => void;
  /** True once a refetch is in flight over data that is already on screen. */
  isRefreshing: boolean;
};

export function useAdminWidgetData<TData>({
  definition,
  load,
  enabled = true,
}: {
  definition: AdminWidgetDefinition<TData>;
  load?: AdminWidgetLoader<TData>;
  enabled?: boolean;
}): AdminWidgetData<TData> {
  const [state, setState] = useState<AdminWidgetDataState<TData>>({ status: "loading" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // A ref, not state: the committed flag is read inside the async continuation, and a value that
  // changed during render would be captured stale by the closure that started the load.
  const latestRequest = useRef(0);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Aborting rather than merely ignoring the result, so a request the widget has given up on
      // stops consuming the host's database connection instead of finishing into a void.
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (isRefetch: boolean) => {
      if (!load) return;

      controller.current?.abort();
      const nextController = new AbortController();
      controller.current = nextController;
      latestRequest.current += 1;
      const request = latestRequest.current;

      setIsRefreshing(isRefetch);
      if (!isRefetch) {
        setState({ status: "loading" });
      }

      try {
        const data = await load(nextController.signal);
        // A newer request has started, or the widget is gone: this answer is no longer wanted.
        if (!mounted.current || request !== latestRequest.current) return;
        // Not marked stale: this is the fresh answer. Staleness means only "a refetch is in
        // flight over what you are looking at", and that is derived from isRefreshing below.
        setState(adminWidgetState(definition, data));
      } catch (error) {
        if (!mounted.current || request !== latestRequest.current) return;
        setState({ status: "error", error: error instanceof Error ? error : new Error(String(error)) });
      } finally {
        if (mounted.current && request === latestRequest.current) {
          setIsRefreshing(false);
        }
      }
    },
    [definition, load],
  );

  useEffect(() => {
    if (!enabled || !load) return;
    // Deferred by a microtask rather than started inline. Setting state synchronously inside an effect
    // cascades an extra render on mount, and the initial state is already `loading`, so there is
    // nothing to schedule: only the async continuation needs to.
    void Promise.resolve().then(() => run(false));
  }, [enabled, load, run]);

  const refetch = useCallback(() => {
    void run(true);
  }, [run]);

  return useMemo(
    () => ({
      // Derived rather than only set on arrival: a renderer asked "may this data be about to be
      // replaced" has to be able to ask while the refetch is in flight, which is exactly the moment
      // the answer is yes. A widget that only learns it is stale once the new data lands has already
      // shown the wrong thing.
      state:
        isRefreshing && state.status === "ready" ? { ...state, stale: true } : state,
      refetch,
      isRefreshing,
    }),
    [state, refetch, isRefreshing],
  );
}

/**
 * Runs several widgets' loads at once, each independently.
 *
 * `Promise.allSettled` rather than `Promise.all`, because one widget's failure is that widget's
 * business and must not discard the answers the others already produced.
 */
export async function adminWidgetLoadAll<TData>(
  entries: ReadonlyArray<{ id: string; load: AdminWidgetLoader<TData> }>,
): Promise<Record<string, AdminWidgetDataState<TData>>> {
  const settled = await Promise.allSettled(
    entries.map(async (entry) => [entry.id, await entry.load(new AbortController().signal)] as const),
  );

  const states: Record<string, AdminWidgetDataState<TData>> = {};
  settled.forEach((result, index) => {
    const id = entries[index].id;
    states[id] =
      result.status === "fulfilled"
        ? { status: "ready", data: result.value[1] }
        : { status: "error", error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) };
  });
  return states;
}
