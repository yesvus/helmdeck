// SPDX-License-Identifier: MIT

import type { ReactNode } from "react";

/**
 * The widget contract: what a dashboard tile declares, and the states it knows how to render.
 *
 * Sizes are named rather than raw column spans so a host can say a chart is at least half width
 * without knowing the grid's column count, which is a layout decision and not the widget's.
 */
export type AdminWidgetSize = "sm" | "md" | "lg" | "xl";

export const adminWidgetSizes: readonly AdminWidgetSize[] = ["sm", "md", "lg", "xl"];

/**
 * What the engine knows about a widget at the moment it renders.
 *
 * Loading and empty are separate from error and ready because they need different copy and different
 * affordances: an empty widget invites an action, a failed one offers a retry, and collapsing them
 * into "no data" is how a dashboard ends up telling a user a failing query has nothing to show.
 */
export type AdminWidgetState<TData> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: TData };

export type AdminWidgetDefinition<TData> = {
  /** Stable across renames of the title, because a persisted dashboard refers to widgets by id. */
  id: string;
  title: string;
  description?: string;
  /** The sizes this widget supports. A layout asking for another one is a problem, not a hint. */
  sizes: readonly AdminWidgetSize[];
  /**
   * How the engine recognizes emptiness. Only the widget knows what its own data means, so this is
   * not inferred from length or a count field.
   *
   * Declared as methods rather than properties so their parameters are checked bivariantly. That is
   * what lets one registry hold widgets whose data types differ: under contravariant properties a
   * `render` taking a concrete data type is not assignable to one taking an erased type, so a host's
   * ordinary list of typed widgets would be rejected. Hosts still write these as plain properties.
   */
  isEmpty?(data: TData): boolean;
  render(data: TData): ReactNode;
  /** Overrides the engine's default for each state. A widget that omits one still renders. */
  renderLoading?(): ReactNode;
  renderEmpty?(): ReactNode;
  renderError?(error: Error, onRetry: () => void): ReactNode;
};

/** A widget's presence on a dashboard, before any data is attached. */
export type AdminWidgetPlacement = {
  widget: string;
  size: AdminWidgetSize;
};
