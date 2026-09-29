// SPDX-License-Identifier: MIT
"use client";

/**
 * Turning a widget's state into markup, with an engine-owned fallback for every state a widget did
 * not claim.
 *
 * A widget that only implements `render` still has to be readable while its data is in flight, empty
 * or failed, so the defaults live here rather than being pushed into every widget definition. The
 * branch is chosen once, which is what keeps a failed widget from rendering as an empty one.
 *
 * `adminWidgetBody` takes its dictionary as an argument so the decision is a pure function and can be
 * checked without a provider; `AdminWidget` is the thin component that supplies it.
 */

import { useAdminMessages, type AdminMessages } from "../i18n.js";
import { AdminEmptyState } from "../primitives/empty-state.js";
import { Button } from "../primitives/button.js";
import { AdminSkeleton } from "../primitives/skeleton.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

export function adminWidgetBody<TData>({
  definition,
  state,
  messages,
  onRetry,
}: {
  definition: AdminWidgetDefinition<TData>;
  state: AdminWidgetState<TData>;
  messages: AdminMessages;
  onRetry?: () => void;
}) {
  switch (state.status) {
    case "loading":
      return definition.renderLoading?.() ?? <AdminSkeleton className="h-6 w-full" />;
    case "empty":
      return (
        definition.renderEmpty?.() ?? (
          <AdminEmptyState title={messages.widget.emptyTitle} body={messages.widget.emptyBody} />
        )
      );
    case "error":
      return (
        definition.renderError?.(state.error, onRetry ?? (() => undefined)) ?? (
          <AdminEmptyState
            title={messages.widget.errorTitle}
            body={state.error.message}
            action={
              // Retry is offered only when the host supplied a way to retry, because a control that
              // cannot do anything is worse than no control.
              onRetry ? (
                <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                  {messages.widget.retry}
                </Button>
              ) : undefined
            }
          />
        )
      );
    case "ready":
      return definition.render(state.data);
  }
}

export function AdminWidget<TData>({
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
  const messages = useAdminMessages();

  return (
    <section
      // The title names the widget even when the body is a skeleton or a failure, so the dashboard's
      // outline survives a widget that is not showing data.
      aria-label={definition.title}
      data-widget={definition.id}
      data-widget-state={state.status}
      className={className}
    >
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">{definition.title}</h2>
      {adminWidgetBody({ definition, state, messages, onRetry })}
    </section>
  );
}
