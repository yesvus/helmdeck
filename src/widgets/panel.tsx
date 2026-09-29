// SPDX-License-Identifier: MIT

import type { AdminMessages } from "../i18n.js";
import { adminWidgetBody } from "./body.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

/**
 * A widget as a tile: its title, and its state rendered.
 *
 * Server-renderable, because the dictionary arrives as a prop rather than being read from a context
 * that only exists on the client. `AdminWidget` is the convenience wrapper for the common case, and
 * this is what a dashboard uses so a page of tiles is not forced to ship as client code.
 */
export function AdminWidgetPanel<TData>({
  definition,
  state,
  messages,
  onRetry,
  className,
}: {
  definition: AdminWidgetDefinition<TData>;
  state: AdminWidgetState<TData>;
  messages: Pick<AdminMessages, "widget">;
  onRetry?: () => void;
  className?: string;
}) {
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
