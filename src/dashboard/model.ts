// SPDX-License-Identifier: MIT

/**
 * A dashboard as a collection of widget placements.
 *
 * The arrangement is not a parallel concept. A placement is `{ widget, size }` with an identity, which
 * is exactly what `AdminCollectionEntry` is, so reordering, removal, identity through a save round
 * trip and the whole editor come from the one collection engine rather than from a second
 * implementation. That composition is the architectural claim in #116, so it is made structurally
 * here rather than described.
 *
 * React-free, like the collection model, so a dashboard can be validated during server rendering.
 */

import {
  adminCollectionAdd,
  adminCollectionEntryId,
  type AdminCollectionDefinition,
  type AdminCollectionEntry,
} from "../collections/registry.js";
import type { AdminWidgetDefinition, AdminWidgetSize } from "../widgets/types.js";

/** One tile on a dashboard: which widget, and how wide. */
export type AdminDashboardPlacementValue = {
  widget: string;
  size: AdminWidgetSize;
};

export type AdminDashboardPlacement = AdminCollectionEntry<AdminDashboardPlacementValue>;

export type AdminDashboard = {
  name: string;
  placements: AdminDashboardPlacement[];
};

/**
 * What the dashboard needs from a registry, and no more.
 *
 * It takes an erased lookup rather than the registry's own `get` because that one is generic in the
 * id, and a generic signature cannot satisfy a plain `(id: string) => …`. Hosts keep the typed `get`;
 * the engine reads through `resolve`.
 */
export type AdminDashboardRegistry = {
  resolve: (id: string) => AdminWidgetDefinition<unknown> | undefined;
  validate: (placement: { widget: string; size: AdminWidgetSize }) => string[];
};

/**
 * Adds a placement at the widget's smallest supported size.
 *
 * The size is the widget's choice rather than the caller's, because asking a caller to name a size
 * the widget does not support produces an arrangement that cannot render.
 */
export function adminDashboardAddPlacement<T extends AdminDashboardRegistry>(
  dashboard: AdminDashboard,
  registry: T,
  widget: string,
): AdminDashboard {
  const definition = registry.resolve(widget);
  if (!definition) {
    throw new Error(`Cannot add "${widget}": no such widget is registered`);
  }
  const size = definition.sizes[0];
  return {
    ...dashboard,
    placements: adminCollectionAdd(dashboard.placements, { widget, size }),
  };
}

export function adminDashboardRemoveAt(
  dashboard: AdminDashboard,
  index: number,
): AdminDashboard {
  const placements = dashboard.placements.filter((_, at) => at !== index);
  if (placements.length === dashboard.placements.length) return dashboard;
  return { ...dashboard, placements };
}

/**
 * Resizes a placement, or leaves it alone when the widget does not support the requested size.
 *
 * Returning the dashboard unchanged rather than storing an unsupported size is deliberate: the
 * registry rejects such a size, so a hand-edited request or a stale editor could otherwise persist a
 * tile that cannot be rendered.
 */
export function adminDashboardSetSize(
  dashboard: AdminDashboard,
  registry: AdminDashboardRegistry,
  index: number,
  size: AdminWidgetSize,
): AdminDashboard {
  const placement = dashboard.placements[index];
  if (!placement || placement.size === size) return dashboard;
  const messages = registry.validate({ widget: placement.widget, size });
  if (messages.length > 0) return dashboard;
  const placements = [...dashboard.placements];
  placements[index] = { ...placement, size };
  return { ...dashboard, placements };
}

/**
 * A collection definition over placements, so the shipped editor can arrange a dashboard directly.
 *
 * `create` returns a deliberately unplaced entry, because the engine cannot invent which widget a new
 * tile should be. A dashboard adds a tile by choosing a widget, so the editor for one is expected to
 * present that choice rather than to call `create` blind.
 */
export function adminDashboardCollection<T extends AdminDashboardRegistry>(
  registry: T,
): AdminCollectionDefinition<AdminDashboardPlacementValue> & {
  /** Narrowed to required: a dashboard placement is always checked, never merely checkable. */
  validate: (entry: AdminCollectionEntry<AdminDashboardPlacementValue>) => string[];
} {
  return {
    name: "placements",
    fields: [{ name: "widget" }, { name: "size" }],
    create: () => ({ widget: "", size: "sm" }),
    validate: (entry) => {
      if (!entry.widget) return ["This tile has no widget yet"];
      return registry.validate({ widget: entry.widget, size: entry.size });
    },
  };
}

/**
 * One message per placement that cannot be rendered, keyed by placement id.
 *
 * Messages rather than a throw because a dashboard is persisted: one written by an earlier release can
 * name a widget this build dropped, and the page has to say so rather than go blank.
 */
export function adminDashboardValidate<T extends AdminDashboardRegistry>(
  registry: T,
  placements: readonly AdminDashboardPlacement[],
): Map<string, string[]> {
  const problems = new Map<string, string[]>();
  for (const placement of placements) {
    const messages = placement.widget
      ? registry.validate({ widget: placement.widget, size: placement.size })
      : ["This tile has no widget yet"];
    if (messages.length > 0) problems.set(placement.id, messages);
  }
  return problems;
}

/** Re-exported so a host can build a placement from persisted data without importing two modules. */
export { adminCollectionEntryId };
