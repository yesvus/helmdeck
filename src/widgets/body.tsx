// SPDX-License-Identifier: MIT

/**
 * A widget's state turned into markup, with an engine-owned fallback for every state a widget did
 * not claim.
 *
 * A widget that only implements `render` still has to be readable while its data is in flight, empty
 * or failed, so the defaults live here rather than being pushed into every widget definition. The
 * branch is chosen once, which is what keeps a failed widget from rendering as an empty one.
 *
 * This is a plain function that takes its dictionary as an argument, deliberately with no directive
 * and no hooks: a module marked `"use client"` cannot be imported from a server component, and
 * reading the dictionary is exactly what would make it one. Keeping the decision here is what lets a
 * dashboard be server-rendered.
 */

import type { AdminMessages } from "../i18n.js";
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
  messages: Pick<AdminMessages, "widget">;
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
