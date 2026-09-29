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
 *
 * It is keyed by widget id rather than a list so `get` keeps each widget's own data type. A
 * heterogeneous registry cannot hold one erased data type: `render` is contravariant in its data, so
 * `AdminWidgetDefinition<Count>` is not assignable to `AdminWidgetDefinition<unknown>`, and erasing
 * it with `any` would push a cast onto every caller of `render`.
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

export type AdminWidgetRegistry<TDefinitions extends AdminWidgetDefinitions> = {
  /** Every registered widget, in registration order, for an editor's add-widget picker. */
  list: () => Readonly<TDefinitions[keyof TDefinitions & string][]>;
  has: (id: string) => boolean;
  get: <K extends keyof TDefinitions & string>(id: K) => TDefinitions[K] | undefined;
  /**
   * One message per problem with a placement, or an empty array when it can be rendered. An unknown
   * widget is reported rather than skipped, because a dashboard that silently loses a tile is worse
   * than one that says which tile went missing.
   */
  validate: (placement: AdminWidgetPlacement) => string[];
};

/** Definitions keyed by widget id, which is the shape that keeps each widget's data type. */
export type AdminWidgetDefinitions = Record<string, AdminWidgetDefinition<never>>;

/**
 * A registry built from a list rather than a keyed map.
 *
 * The data type is the union across the list, because an array is not a key map: `get` still returns
 * a usable definition, and a host that wants `get` to know one widget's exact data type keys the
 * registry by id instead.
 */
export type AdminWidgetDefinitionList = readonly AdminWidgetDefinition<never>[];

export type AdminWidgetListRegistry = AdminWidgetRegistry<{
  [K in string]: AdminWidgetDefinition<never>;
}>;

export function createAdminWidgetRegistry<const TDefinitions extends AdminWidgetDefinitions>(
  definitions: TDefinitions,
): AdminWidgetRegistry<TDefinitions>;
export function createAdminWidgetRegistry(
  definitions: AdminWidgetDefinitionList,
): AdminWidgetListRegistry;
export function createAdminWidgetRegistry(): AdminWidgetRegistry<Record<never, never>>;
export function createAdminWidgetRegistry(
  definitions: AdminWidgetDefinitions | AdminWidgetDefinitionList = {},
): AdminWidgetRegistry<AdminWidgetDefinitions> | AdminWidgetListRegistry {
  const byId = new Map<string, AdminWidgetDefinition<never>>();

  for (const [key, definition] of Array.isArray(definitions)
    ? definitions.map((definition) => [definition.id, definition] as const)
    : Object.entries(definitions)) {
    if (byId.has(definition.id)) {
      // Two widgets sharing an id make every persisted dashboard ambiguous, and which one wins would
      // depend on the order they happened to be listed in.
      throw new Error(`Two widgets are both registered as "${definition.id}"`);
    }
    if (!Array.isArray(definitions) && key !== definition.id) {
      // A registry that lists a widget under one id and answers another is the kind of thing that
      // should stop the process rather than the dashboard.
      throw new Error(`Widget registered as "${key}" declares the id "${definition.id}"`);
    }
    byId.set(definition.id, definition);
  }

  return {
    list: () => [...byId.values()],
    has: (id) => byId.has(id),
    // A persisted dashboard can name a widget this build no longer registers, and no compiler can
    // see that, so the miss is answered rather than throwing.
    get: (id) => byId.get(id),
    validate: (placement) => {
      const definition = byId.get(placement.widget);
      if (!definition) {
        return [`No widget is registered as "${placement.widget}"`];
      }
      if (!definition.sizes.includes(placement.size)) {
        return [
          `Widget "${placement.widget}" does not support the size "${placement.size}". It supports ${definition.sizes.join(", ")}`,
        ];
      }
      return [];
    },
  };
}
