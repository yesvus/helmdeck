// SPDX-License-Identifier: MIT

/**
 * The engine-owned widget registry: which widgets exist, and whether a dashboard's arrangement of
 * them is one the engine can render.
 *
 * The registry exists for two consumers. The editor needs to know what a host may add, and a
 * dashboard persisted by one release has to be renderable by the next, so an arrangement is checked
 * against the registry rather than trusted. Validation returns messages instead of throwing,
 * because a saved dashboard can be wrong in a way the user should see next to the offending widget
 * rather than as a blank page.
 */

import {
  adminWidgetSizes,
  type AdminWidgetDefinition,
  type AdminWidgetPlacement,
  type AdminWidgetState,
} from "./types.js";

export function defineAdminWidget<TData>(
  definition: AdminWidgetDefinition<TData>,
): AdminWidgetDefinition<TData> {
  if (!definition.id) {
    throw new Error("A widget needs an id, because a persisted dashboard refers to it by that id");
  }
  if (definition.sizes.length === 0) {
    // A widget that supports no size cannot be placed, and a layout that omits the size would
    // otherwise have to guess one the widget never agreed to.
    throw new Error(`Widget "${definition.id}" supports no sizes`);
  }
  for (const size of definition.sizes) {
    if (!adminWidgetSizes.includes(size)) {
      throw new Error(`Widget "${definition.id}" declares the unknown size "${size}"`);
    }
  }
  return definition;
}

/**
 * The state for data the engine already has, which is the only decision it can make on its own.
 *
 * Emptiness is delegated rather than inferred, so the ready and empty branches are decided in one
 * place instead of at every call site.
 */
export function adminWidgetState<TData>(
  definition: AdminWidgetDefinition<TData>,
  data: TData,
): AdminWidgetState<TData> {
  return definition.isEmpty?.(data) ? { status: "empty" } : { status: "ready", data };
}

export type AdminWidgetRegistry = {
  /** Every registered widget, in registration order, for an editor's add-widget picker. */
  list: () => readonly AdminWidgetDefinition<unknown>[];
  has: (id: string) => boolean;
  get: (id: string) => AdminWidgetDefinition<unknown> | undefined;
  /**
   * One message per problem with a placement, or an empty array when it can be rendered. An unknown
   * widget is reported rather than skipped, because a dashboard that silently loses a tile is worse
   * than one that says which tile went missing.
   */
  validate: (placement: AdminWidgetPlacement) => string[];
};

export function createAdminWidgetRegistry(
  definitions: readonly AdminWidgetDefinition<unknown>[] = [],
): AdminWidgetRegistry {
  const byId = new Map<string, AdminWidgetDefinition<unknown>>();

  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      // Two widgets sharing an id would make every persisted dashboard ambiguous, and the second
      // would silently win depending on registration order.
      throw new Error(`Two widgets are both registered as "${definition.id}"`);
    }
    byId.set(definition.id, definition);
  }

  return {
    list: () => [...byId.values()],
    has: (id) => byId.has(id),
    get: (id) => byId.get(id),
    validate: (placement) => {
      const definition = byId.get(placement.widget);
      if (!definition) return [`No widget is registered as "${placement.widget}"`];
      if (!definition.sizes.includes(placement.size)) {
        return [
          `Widget "${placement.widget}" does not support the size "${placement.size}". It supports ${definition.sizes.join(", ")}`,
        ];
      }
      return [];
    },
  };
}
