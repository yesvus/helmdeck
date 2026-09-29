// SPDX-License-Identifier: MIT

import { cn } from "../cn.js";
import type { AdminWidgetState } from "../widgets/types.js";
import {
  adminDashboardCopy,
  adminDashboardProblems,
  dashboardGridClassName,
  AdminDashboardMissingTile,
  AdminDashboardTile,
  type AdminDashboardCopy,
} from "./grid.js";
import type { AdminDashboardPlacement, AdminDashboardRegistry } from "./model.js";

export { dashboardGridClassName } from "./grid.js";

/**
 * The server-renderable dashboard: the host resolves every widget's data and hands it over.
 *
 * Server-safe by construction, because it takes its copy as a prop rather than reading the interface
 * dictionary from a client context. A host that wants each widget to load itself uses
 * `AdminDashboardTiles`, which renders this same grid.
 */
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
   * without a cast; the erasure happens once, where the widget's own `render` consumes it.
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
  messages?: Partial<AdminDashboardCopy>;
}) {
  const copy = adminDashboardCopy(messages);
  const problems = adminDashboardProblems(registry, placements);

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
        const placementProblems = problems.get(placement.id) ?? [];

        // A tile the registry no longer knows is reported in place. Dropping it would leave a hole
        // that reads as a layout bug, and taking the page down would mean one stale row loses the
        // dashboard that still works.
        if (!definition) {
          return (
            <AdminDashboardMissingTile
              key={placement.id}
              placement={placement}
              problems={placementProblems}
              copy={copy}
            />
          );
        }

        return (
          <AdminDashboardTile
            key={placement.id}
            placement={placement}
            definition={definition}
            state={states[placement.id] ?? { status: "loading" }}
            onRetry={onRetry ? () => onRetry(placement) : undefined}
            problems={placementProblems}
            copy={copy}
          />
        );
      })}
    </div>
  );
}
