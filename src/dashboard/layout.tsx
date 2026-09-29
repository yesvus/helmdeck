// SPDX-License-Identifier: MIT

/**
 * Arranging placements into a responsive grid.
 *
 * The size classes are literal Tailwind utilities rather than computed ones, so the JIT sees them at
 * build time and the grid renders in a server component. A dynamic `col-span-${n}` would compile to
 * nothing and fail silently, which is the failure this file is arranged to make impossible.
 *
 * No positioning library is involved on purpose. Drag-resize and pixel layout solve a problem this
 * product does not have, and they cost the two things this repository treats as non-negotiable: the
 * grid stays server-renderable, and sizing stays reachable from the keyboard. Reordering already comes
 * from the collection engine and dnd-kit.
 */

import { cn } from "../cn.js";
import { defaultWidgetMessages } from "../widgets/messages.js";
import { AdminWidgetPanel } from "../widgets/panel.js";
import { defaultDashboardMessages, type AdminDashboardMessages } from "./messages.js";
import type { AdminMessages } from "../i18n.js";
import type { AdminWidgetSize, AdminWidgetState } from "../widgets/types.js";
import {
  adminDashboardValidate,
  type AdminDashboardPlacement,
  type AdminDashboardRegistry,
} from "./model.js";

/**
 * One owner per CSS property, per column count. The breakpoints are the grid's own, and a size may
 * only widen it at the breakpoint where the grid has that many columns, so `xl` spanning four is
 * applied at `lg` where four columns exist rather than at a width where two do.
 */
const sizeClasses: Record<AdminWidgetSize, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "lg:col-span-3",
  xl: "lg:col-span-4",
};

export const dashboardGridClassName = "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4";

export function AdminDashboardLayout<TRegistry extends AdminDashboardRegistry>({
  registry,
  placements,
  states,
  onRetry,
  className,
  messages,
}: {
  registry: TRegistry;
  placements: readonly AdminDashboardPlacement[];
  /**
   * Each widget's state, keyed by placement id, resolved by the host or by the data contract.
   *
   * The data is typed `unknown` rather than the widget's own type because a dashboard holds widgets
   * of many types at once and the engine is not generic in all of them. Hosts write real data here
   * without a cast; the erasure happens once, inside, where the widget's own `render` consumes it.
   */
  states: Readonly<Record<string, AdminWidgetState<unknown>>>;
  onRetry?: (placement: AdminDashboardPlacement) => void;
  className?: string;
  /**
   * Copy for the engine's own dashboard messages. Supplied rather than read from the interface
   * dictionary, which lives in a client context, so that a page of tiles stays a server component.
   * Defaults to the shipped English; a host rendering the dashboard in a server component passes the
   * dictionary it already resolved.
   */
  messages?: Pick<AdminMessages, "widget"> & AdminDashboardMessages;
}) {
  const copy = {
    ...defaultDashboardMessages,
    ...messages,
    widget: { ...defaultWidgetMessages, ...messages?.widget },
  };
  const problems = adminDashboardValidate(registry, placements);

  if (placements.length === 0) {
    return (
      <div className={cn(dashboardGridClassName, className)}>
        <p className="rounded-admin-card border border-dashed border-admin-border bg-admin-surface p-8 text-center text-sm text-zinc-500">
          {copy.empty}
        </p>
      </div>
    );
  }

  return (
    <div className={cn(dashboardGridClassName, className)}>
      {placements.map((placement) => {
        const definition = registry.resolve(placement.widget);
        const state = states[placement.id];

        // A tile the registry no longer knows, or a size it does not support, is reported in place.
        // Dropping it would leave a hole that reads as a layout bug, and taking the page down would
        // mean one stale row loses the dashboard that still works.
        if (!definition) {
          return (
            <div
              key={placement.id}
              data-placement={placement.id}
              className="rounded-admin-card border border-dashed border-admin-danger-border bg-admin-danger-surface p-5"
            >
              <p className="text-sm font-semibold text-admin-danger-text">
                {copy.missingWidget(placement.widget)}
              </p>
              {problems.get(placement.id)?.map((problem) => (
                <p key={problem} className="mt-1 text-xs text-admin-danger-text">
                  {problem}
                </p>
              ))}
            </div>
          );
        }

        return (
          <div
            key={placement.id}
            data-placement={placement.id}
            data-widget={placement.widget}
            className={cn(sizeClasses[placement.size], "min-w-0")}
          >
            <AdminWidgetPanel
              definition={definition as AdminWidgetDefinitionLike}
              state={(state ?? { status: "loading" }) as AdminWidgetState<never>}
              messages={copy}
              onRetry={onRetry ? () => onRetry(placement) : undefined}
              className="h-full"
            />
          </div>
        );
      })}
    </div>
  );
}

type AdminWidgetDefinitionLike = Parameters<typeof AdminWidgetPanel>[0]["definition"];
