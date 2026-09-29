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

/** The id a widget is known by, inferring a map of id to data type from the definitions given. */
export type AdminWidgetDefinitions = Record<string, AdminWidgetDefinition<never>>;

export type AdminWidgetRegistry<TDefinitions extends AdminWidgetDefinitions = AdminWidgetDefinitions> =
  {
    /** Every registered widget, in registration order, for an editor's add-widget picker. */
    list: () => Readonly<AdminWidgetDefinition<never>[]>;
    has: (id: string) => boolean;
    get: <K extends keyof TDefinitions & string>(id: K) => TDefinitions[K] | undefined;
    /**
     * One message per problem with a placement, or an empty array when it can be rendered. An unknown
     * widget is reported rather than skipped, because a dashboard that silently loses a tile is worse
     * than one that says which tile went missing.
     */
    validate: (placement: AdminWidgetPlacement) => string[];
  };

export function createAdminWidgetRegistry<const TDefinitions extends AdminWidgetDefinitions>(
  definitions: TDefinitions,
): AdminWidgetRegistry<TDefinitions>;
export function createAdminWidgetRegistry(): AdminWidgetRegistry;
export function createAdminWidgetRegistry<TDefinitions extends AdminWidgetDefinitions>(
  definitions: TDefinitions = {} as TDefinitions,
): AdminWidgetRegistry<TDefinitions> {
  for (const [key, definition] of Object.entries(definitions)) {
    if (key !== definition.id) {
      // Keying by id makes the mismatch a type error as well, but a caller can still get here from
      // plain JavaScript, and a registry that lists a widget under one id and answers another is
      // exactly the kind of thing that should stop the process rather than the dashboard.
      throw new Error(`Widget registered as "${key}" declares the id "${definition.id}"`);
    }
  }

  // A persisted dashboard can name a widget this build no longer registers, and the compiler cannot
  // see that, so the runtime check stays. It is written as a standalone generic so each call keeps
  // its own id type instead of collapsing to a union the caller would have to narrow.
  const get = <K extends keyof TDefinitions & string>(id: K): TDefinitions[K] | undefined =>
    Object.hasOwn(definitions, id)
      ? (definitions[id] as TDefinitions[K])
      : undefined;

  return {
    list: () => Object.values(definitions),
    has: (id) => Object.hasOwn(definitions, id),
    get,
    validate: (placement) => {
      if (!Object.hasOwn(definitions, placement.widget)) {
        return [`No widget is registered as "${placement.widget}"`];
      }
      const definition = definitions[placement.widget as keyof TDefinitions] as AdminWidgetDefinition<never>;
      if (!definition.sizes.includes(placement.size)) {
        return [
          `Widget "${placement.widget}" does not support the size "${placement.size}". It supports ${definition.sizes.join(", ")}`,
        ];
      }
      return [];
    },
  };
}
