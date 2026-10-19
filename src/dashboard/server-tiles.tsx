// SPDX-License-Identifier: MIT

import { Suspense, type ReactNode } from "react";
import { cn } from "../cn.js";
import { adminWidgetState } from "../widgets/registry.js";
import type { AdminWidgetDefinition, AdminWidgetState } from "../widgets/types.js";
import {
  adminDashboardCopy,
  adminDashboardProblems,
  dashboardGridClassName,
  AdminDashboardMissingTile,
  AdminDashboardTile,
  type AdminDashboardCopy,
} from "./grid.js";
import type { AdminDashboardPlacement, AdminDashboardRegistry } from "./model.js";

type AdminDashboardServerLoader = () => Promise<unknown>;
type AdminDashboardServerAction = (formData: FormData) => void | Promise<void>;

async function AdminDashboardServerTile({
  placement,
  definition,
  loader,
  retryAction,
  problems,
  copy,
}: {
  placement: AdminDashboardPlacement;
  definition: AdminWidgetDefinition<unknown>;
  loader?: AdminDashboardServerLoader;
  retryAction?: AdminDashboardServerAction;
  problems: string[];
  copy: AdminDashboardCopy;
}) {
  let state: AdminWidgetState<unknown>;
  if (!loader) {
    state = { status: "error", error: new Error(`No server loader for placement "${placement.id}"`) };
  } else {
    try {
      state = adminWidgetState(definition, await loader());
    } catch (error) {
      state = { status: "error", error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  return (
    <AdminDashboardTile
      placement={placement}
      definition={definition}
      state={state}
      retryAction={retryAction}
      problems={problems}
      copy={copy}
    />
  );
}

function AdminDashboardServerFallback({
  placement,
  definition,
  problems,
  copy,
}: {
  placement: AdminDashboardPlacement;
  definition: AdminWidgetDefinition<unknown>;
  problems: string[];
  copy: AdminDashboardCopy;
}) {
  return (
    <AdminDashboardTile
      placement={placement}
      definition={definition}
      state={{ status: "loading" }}
      problems={problems}
      copy={copy}
    />
  );
}

export function AdminDashboardServerTiles<TRegistry extends AdminDashboardRegistry>({
  registry,
  placements,
  loaders,
  retryActions,
  className,
  messages,
  fallback,
}: {
  registry: TRegistry;
  placements: readonly AdminDashboardPlacement[];
  loaders: Readonly<Record<string, AdminDashboardServerLoader>>;
  retryActions?: Readonly<Record<string, AdminDashboardServerAction>>;
  className?: string;
  messages?: Partial<AdminDashboardCopy>;
  fallback?: ReactNode;
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
          return <AdminDashboardMissingTile key={placement.id} placement={placement} problems={placementProblems} copy={copy} />;
        }

        return (
          <Suspense
            key={placement.id}
            fallback={fallback ?? (
              <AdminDashboardServerFallback
                placement={placement}
                definition={definition}
                problems={placementProblems}
                copy={copy}
              />
            )}
          >
            <AdminDashboardServerTile
              placement={placement}
              definition={definition}
              loader={loaders[placement.id]}
              retryAction={retryActions?.[placement.id]}
              problems={placementProblems}
              copy={copy}
            />
          </Suspense>
        );
      })}
    </div>
  );
}
