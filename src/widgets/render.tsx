// SPDX-License-Identifier: MIT
"use client";

/**
 * Turning a widget's state into markup, with an engine-owned fallback for every state a widget did
 * not claim.
 *
 * A widget that only implements `render` still has to be readable while its data is in flight, empty
 * or failed, so the defaults live here rather than being pushed into every widget definition. The
 * branch is chosen once, which is what keeps a failed widget from rendering as an empty one.
 */

import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { Button } from "../primitives/button.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

export function renderAdminWidget<TData>({
  definition,
  state,
  onRetry,
  className,
}: {
  definition: AdminWidgetDefinition<TData>;
  state: AdminWidgetState<TData>;
  onRetry?: () => void;
  className?: string;
}) {
  const i18n = useAdminMessages();
  const retry = onRetry ?? (() => undefined);

  const body = (() => {
    switch (state.status) {
      case "loading":
        return definition.renderLoading?.() ?? <AdminSkeleton className="h-6 w-full" />;
      case "empty":
        return (
          definition.renderEmpty?.() ?? (
            <AdminEmptyState title={i18n.widget.emptyTitle} body={i18n.widget.emptyBody} />
          )
        );
      case "error":
        return (
          definition.renderError?.(state.error, retry) ?? (
            <AdminEmptyState
              title={i18n.widget.errorTitle}
              body={state.error.message}
              action={
                onRetry ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                    {i18n.widget.retry}
                  </Button>
                ) : undefined
              }
            />
          )
        );
      case "ready":
        return definition.render(state.data);
    }
  })();

  return (
    <section
      // The heading is the widget's title even when the body is a skeleton or a failure, so the
      // dashboard's outline survives a widget that is not showing data.
      aria-label={definition.title}
      data-widget={definition.id}
      data-widget-state={state.status}
      className={cn("rounded-admin-card border border-admin-border bg-admin-surface p-5", className)}
    >
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{definition.title}</h2>
      {body}
    </section>
  );
}
