// SPDX-License-Identifier: MIT

/**
 * The dashboard's grid and the wrapper around one tile, shared by both entry points.
 *
 * A host with data already resolved uses the server-safe layout; a host that wants each widget to load
 * itself uses the client component. They render the same markup, and that is the reason this is one
 * file rather than two. A previous version had the tile markup inline in the layout, and adding a
 * validation message around the tile introduced a wrapper that took the grid's span, so every widget
 * size silently stopped applying. Two copies of a tile is how that happens.
 */

import { cn } from "../cn.js";
import { defaultWidgetMessages } from "../widgets/messages.js";
import { AdminWidgetPanel } from "../widgets/panel.js";
import { defaultDashboardMessages, type AdminDashboardMessages } from "./messages.js";
import type { AdminMessages } from "../i18n.js";
import type { AdminWidgetDefinition, AdminWidgetSize, AdminWidgetState } from "../widgets/types.js";
import {
  adminDashboardValidate,
  type AdminDashboardPlacement,
  type AdminDashboardRegistry,
} from "./model.js";

/**
 * One owner per CSS property, per column count. The breakpoints are the grid's own, and a size may
 * only widen it at the breakpoint where the grid has that many columns, so `xl` spanning four is
 * applied at `lg` where four columns exist rather than at a width where two do.
 *
 * These are literal utilities rather than interpolated ones, because Tailwind only emits a class it
 * can find in scanned source and `col-span-${n}` would generate nothing. A host compiles them by
 * pointing `@source` at the installed package, which the README documents and a test enforces.
 */
const sizeClasses: Record<AdminWidgetSize, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "lg:col-span-3",
  xl: "lg:col-span-4",
};

export const dashboardGridClassName = "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4";

export type AdminDashboardCopy = Pick<AdminMessages, "widget"> & AdminDashboardMessages;

export function adminDashboardCopy(messages?: Partial<AdminDashboardCopy>): AdminDashboardCopy {
  return {
    ...defaultDashboardMessages,
    ...messages,
    widget: { ...defaultWidgetMessages, ...messages?.widget },
  };
}

/**
 * One tile, as the grid's direct child.
 *
 * It is deliberately a single element. A grid places its direct children, so a wrapper around the
 * tile would take the span class while the tile inside kept the measurement hooks, and the layout
 * would stop responding to widget sizes without any error.
 */
export function AdminDashboardTile({
  placement,
  definition,
  state,
  onRetry,
  problems,
  copy,
}: {
  placement: AdminDashboardPlacement;
  definition: AdminWidgetDefinition<unknown>;
  state: AdminWidgetState<unknown>;
  onRetry?: () => void;
  problems: string[];
  copy: AdminDashboardCopy;
}) {
  return (
    <div
      data-placement={placement.id}
      data-widget={placement.widget}
      className={cn(sizeClasses[placement.size], "min-w-0")}
    >
      {/* A widget that exists but at a size it does not support still renders, so the problem is
          reported beside it. Rendering nothing would lose a tile the registry does know about, and
          rendering silently would hide a layout the engine cannot honour. */}
      {problems.length > 0 ? (
        <p role="alert" className="mb-2 text-xs font-medium text-admin-danger-text">
          {problems.join(" ")}
        </p>
      ) : null}
      <AdminWidgetPanel
        definition={definition}
        state={state}
        messages={copy}
        onRetry={onRetry}
        className="h-full"
      />
    </div>
  );
}

/** A placement naming a widget this build does not provide, reported in place of a tile. */
export function AdminDashboardMissingTile({
  placement,
  problems,
  copy,
}: {
  placement: AdminDashboardPlacement;
  problems: string[];
  copy: AdminDashboardCopy;
}) {
  return (
    <div
      data-placement={placement.id}
      data-widget={placement.widget}
      className="rounded-admin-card border border-dashed border-admin-danger-border bg-admin-danger-surface p-5"
    >
      <p className="text-sm font-semibold text-admin-danger-text">
        {copy.missingWidget(placement.widget)}
      </p>
      {problems.map((problem) => (
        <p key={problem} className="mt-1 text-xs text-admin-danger-text">
          {problem}
        </p>
      ))}
    </div>
  );
}

export function adminDashboardProblems<TRegistry extends AdminDashboardRegistry>(
  registry: TRegistry,
  placements: readonly AdminDashboardPlacement[],
): Map<string, string[]> {
  return adminDashboardValidate(registry, placements);
}
