// SPDX-License-Identifier: MIT
"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../primitives/button.js";
import { AdminSectionCard } from "../primitives/layout.js";

/**
 * Error boundary body for an admin route segment.
 *
 * `reset()` only re-renders the boundary's children, so a server-side failure (missing column,
 * query timeout, ...) repeats on every retry and the button appears to do nothing. Reloading the
 * document re-runs the server work, which is what recovery actually needs.
 */
export function AdminErrorBoundary({
  error,
  reset,
  title = "Something went wrong",
  description = "An error occurred while loading this page. Please reload to try again.",
  reloadLabel = "Reload page",
  children,
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
  reloadLabel?: string;
  children?: ReactNode;
}) {
  return (
    <AdminSectionCard icon={AlertTriangle} title={title} description={description}>
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {error?.digest ? <span className="font-mono text-xs text-zinc-400">{error.digest}</span> : null}
        </div>
        <Button type="button" onClick={() => (typeof window !== "undefined" ? window.location.reload() : reset?.())}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {reloadLabel}
        </Button>
        {children}
      </div>
    </AdminSectionCard>
  );
}

export default AdminErrorBoundary;
