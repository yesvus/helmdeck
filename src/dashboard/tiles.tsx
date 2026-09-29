// SPDX-License-Identifier: MIT
"use client";

/**
 * The live dashboard: each widget loads its own data, and a slow or failing one affects only itself.
 *
 * One component per tile rather than a loop calling the hook. A varying number of hooks in a single
 * component is what the rules of hooks forbid, and it misaligns silently when a tile is added or
 * removed, so the states could not then be collected into the map the server-safe layout expects.
 * Owning the state per tile is what lets the retry be the hook's own `refetch` with no attempt
 * counter and nothing for the host to wire.
 */

import { useCallback } from "react";
import { cn } from "../cn.js";
import { useAdminWidgetData, type AdminWidgetLoader } from "../widgets/data.js";
import type { AdminWidgetDefinition } from "../widgets/types.js";
import {
  adminDashboardCopy,
  adminDashboardProblems,
  dashboardGridClassName,
  AdminDashboardMissingTile,
  AdminDashboardTile,
  type AdminDashboardCopy,
} from "./grid.js";
import type { AdminDashboardPlacement, AdminDashboardRegistry } from "./model.js";

function AdminDashboardLiveTile({
  placement,
  definition,
  loader,
  problems,
  copy,
}: {
  placement: AdminDashboardPlacement;
  definition: AdminWidgetDefinition<unknown>;
  loader?: AdminWidgetLoader<unknown>;
  problems: string[];
  copy: AdminDashboardCopy;
}) {
  // The callback lives in this component rather than in the parent's map, so the hook call and the
  // memo that feeds it are both unconditional for the lifetime of one tile.
  const { state, refetch } = useAdminWidgetData({
    definition,
    load: useCallback(
      (signal: AbortSignal) => (loader ? loader(signal) : Promise.reject(new Error("no loader"))),
      [loader],
    ),
  });

  return (
    <AdminDashboardTile
      placement={placement}
      definition={definition}
      state={state}
      onRetry={refetch}
      problems={problems}
      copy={copy}
    />
  );
}

export function AdminDashboardTiles<TRegistry extends AdminDashboardRegistry>({
  registry,
  placements,
  loaders,
  className,
  messages,
}: {
  registry: TRegistry;
  placements: readonly AdminDashboardPlacement[];
  /** Each placement's loader. A widget with no loader shows its loading state rather than a blank. */
  loaders: Readonly<Record<string, AdminWidgetLoader<unknown>>>;
  className?: string;
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

        const loader = loaders[placement.id];

        return (
          <AdminDashboardLiveTile
            key={placement.id}
            placement={placement}
            definition={definition}
            loader={loader}
            problems={placementProblems}
            copy={copy}
          />
        );
      })}
    </div>
  );
}
