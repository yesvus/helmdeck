// SPDX-License-Identifier: MIT

/**
 * The card a chart lives in, with a state for each of the things that can happen to its data.
 *
 * Loading, failed and empty are three different facts, and collapsing them is how a dashboard ends
 * up showing "$0.00" because a query threw. So the frame is the only place a chart decides what to
 * draw, a chart decides nothing, and a host that renders its own chrome still gets the same
 * `status` contract from the chart components.
 *
 * Deliberately without a `"use client"` directive and without hooks, for the reason
 * `widgets/body.tsx` gives: a module marked client cannot be imported from a server component, and
 * choosing what to render is exactly the work that must stay on the server side of that boundary.
 */

import type { LucideIcon } from "lucide-react";
import { AdminBanner } from "../primitives/layout.js";
import { AdminWidgetPermanentError, adminWidgetRetryIsWorthwhile } from "../widgets/retry.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { AdminSectionCard } from "../primitives/layout.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import { Button } from "../primitives/button.js";

/**
 * The same four states a widget load produces, under the same names.
 *
 * Reusing the vocabulary rather than a chart-shaped one is what keeps a host from writing a second
 * emptiness rule: the load hook already asked the widget's own `isEmpty` and answered, so a chart
 * that took an `isEmpty` prop of its own would be handed a decision that has been made.
 */
export type AdminChartStatus = "loading" | "empty" | "error" | "ready";

export type AdminChartFrameLabels = {
  loading: string;
  errorTitle: string;
  emptyTitle: string;
  emptyBody: string;
  retry: string;
};

export const defaultAdminChartFrameLabels: AdminChartFrameLabels = {
  loading: "Loading chart data",
  errorTitle: "This chart could not be loaded",
  emptyTitle: "No data for this period",
  emptyBody: "Nothing has been recorded in this range yet. The chart fills in as rows arrive.",
  retry: "Try again",
};

function ChartLoadingPlaceholder({ height, label }: { height: number; label: string }) {
  // Heights chosen to read as a chart mid-load rather than as generic blocks: a bar row over a
  // baseline, which is the shape the real content is about to take.
  const bars = [42, 68, 30, 84, 55, 72, 38];
  return (
    <div style={{ height }} role="status" aria-live="polite" className="w-full">
      <span className="sr-only">{label}</span>
      <div className="flex h-full items-end gap-2 border-b border-zinc-200 px-1">
        {bars.map((bar, index) => (
          <AdminSkeleton key={index} className="flex-1 rounded-t" style={{ height: `${bar}%` }} />
        ))}
      </div>
    </div>
  );
}

export function AdminChartFrame({
  icon: Icon,
  title,
  description,
  status,
  error,
  onRetry,
  labels = defaultAdminChartFrameLabels,
  height = 240,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  status: AdminChartStatus;
  error?: Error;
  onRetry?: () => void;
  labels?: Partial<AdminChartFrameLabels>;
  height?: number;
  children: React.ReactNode;
}) {
  const merged = { ...defaultAdminChartFrameLabels, ...labels };

  return (
    <AdminSectionCard icon={Icon} title={title} description={description}>
      {status === "loading" ? <ChartLoadingPlaceholder height={height} label={merged.loading} /> : null}

      {status === "error" ? (
        <div className="space-y-3">
            <AdminBanner
              tone="danger"
              title={merged.errorTitle}
              // A permanent refusal says what to do instead, so the operator is not left with a failure
              // and no way forward.
              body={
                error instanceof AdminWidgetPermanentError
                  ? `${error.message} ${error.remedy}`
                  : error?.message ?? ""
              }
            />
            {/* Offered only when repeating the request could help. A chart refused for a reason no retry
                removes would otherwise show a control that can only fail again. */}
            {onRetry !== undefined && adminWidgetRetryIsWorthwhile(error) ? (
              <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                {merged.retry}
              </Button>
            ) : null}
        </div>
      ) : null}

      {status === "empty" ? (
        <AdminEmptyState title={merged.emptyTitle} body={merged.emptyBody} />
      ) : null}

      {status === "ready" ? children : null}
    </AdminSectionCard>
  );
}
