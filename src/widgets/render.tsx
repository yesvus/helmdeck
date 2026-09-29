// SPDX-License-Identifier: MIT
"use client";

import { useAdminMessages } from "../i18n.js";
import { AdminWidgetPanel } from "./panel.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "./types.js";

/**
 * A widget that reads the active dictionary itself.
 *
 * The client boundary lives here, on the one component that needs the dictionary from context, and
 * not on the shared markup beneath it. That placement is what allows a dashboard of many widgets to
 * be server-rendered through `AdminWidgetPanel`, which is also what a server component must use.
 */
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
  return (
    <AdminWidgetPanel
      definition={definition}
      state={state}
      messages={useAdminMessages()}
      onRetry={onRetry}
      className={className}
    />
  );
}

