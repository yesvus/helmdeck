// SPDX-License-Identifier: MIT
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A live visitor counter for the admin dashboard.
 *
 * The host owns session tracking (for example a heartbeat endpoint backed by Redis); this component
 * only displays the count and refreshes it on an interval when `fetchCount` is passed. Passing a static
 * `value` renders without polling, so hosts that resolve the count on the server can use it as a plain tile.
 */
export function AdminVisitorCount({
  value,
  fetchCount,
  refreshIntervalMs = 30000,
  label = "Live visitors",
  suffix = "visitors",
}: {
  value?: number;
  fetchCount?: () => Promise<number>;
  refreshIntervalMs?: number;
  label?: string;
  suffix?: string;
}) {
  const [count, setCount] = useState<number | undefined>(value);
  const fetchRef = useRef(fetchCount);
  useEffect(() => {
    fetchRef.current = fetchCount;
  }, [fetchCount]);

  const requestIdRef = useRef(0);
  const hasFetcher = typeof fetchCount === "function";

  const interval =
    Number.isFinite(refreshIntervalMs) && refreshIntervalMs > 0 ? refreshIntervalMs : 30000;

  useEffect(() => {
    if (!hasFetcher) return;
    let cancelled = false;

    async function load() {
      const currentRequestId = ++requestIdRef.current;
      try {
        const next = await fetchRef.current?.();
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setCount(next);
        }
      } catch {
        // A failed refresh keeps the last known count rather than clearing the tile.
      }
    }

    load();
    const timerId = window.setInterval(load, interval);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [hasFetcher, interval]);

  const displayCount = fetchCount ? (count ?? value ?? "—") : (value ?? count ?? "—");

  return (
    <div
      className="flex items-baseline gap-2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-zinc-900">{displayCount}</span>
      <span className="text-xs text-zinc-500">{suffix}</span>
    </div>
  );
}
