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
import { AdminWidgetPermanentError, adminWidgetRetryIsWorthwhile } from "./retry.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

export function adminWidgetBody<TData>({
  definition,
  state,
  messages,
  onRetry,
  retryIsWorthwhile,
}: {
  definition: AdminWidgetDefinition<TData>;
  state: AdminWidgetState<TData>;
  messages: Pick<AdminMessages, "widget">;
  onRetry?: () => void;
  /**
   * Overrides whether this failure is worth retrying. The default reads the error, and a host with a
   * failure the package cannot classify passes its own answer rather than editing the classifier.
   */
  retryIsWorthwhile?: (error: unknown) => boolean;
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
      case "error": {
        // Retry is offered only when the host supplied a way to retry **and** repeating the request
        // could plausibly help. A refusal that cannot be retried away renders no control, because a
        // button that can only fail costs the operator a click and teaches them it does nothing.
        const worthRetrying = (retryIsWorthwhile ?? adminWidgetRetryIsWorthwhile)(state.error);
        const canRetry = onRetry !== undefined && worthRetrying;
        return (
          definition.renderError?.(state.error, canRetry ? onRetry! : () => undefined) ?? (
            <AdminEmptyState
              title={messages.widget.errorTitle}
              // A permanent refusal says what to do instead, because "this failed" with no retry and
              // no remedy is a dead end the operator cannot act on.
              body={
                state.error instanceof AdminWidgetPermanentError
                  ? `${state.error.message} ${state.error.remedy}`
                  : state.error.message
              }
              action={
                canRetry ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                    {messages.widget.retry}
                  </Button>
                ) : undefined
              }
            />
          )
        );
      }
    case "ready":
      return definition.render(state.data);
  }
}
