// SPDX-License-Identifier: MIT

/**
 * The widgets the package ships, and the one thing every one of them is for.
 *
 * A host's dashboard is mostly the same six tiles: a few figures, something to look at over time,
 * something ranked, a short table, a list, and a feed of what changed. Each of those is a widget
 * definition the host has to write, and each is written from scratch, which is why a host that
 * installs this package still ends up with a directory of tile components.
 *
 * These six are what the package ships instead. Every one of them:
 *
 * - renders its own loading, empty, error and ready states, and takes the failure's message from
 *   the engine rather than a sentence of its own, so a failed query never reads as an empty one;
 * - decides something a host would otherwise have to decide, which is what makes it worth having
 *   (the sections below each name their decision);
 * - declares which tile sizes it makes sense at, so a layout asking for something it cannot render
 *   is refused by the registry;
 * - treats an answer it cannot read as empty rather than as a crash, because a query returning the
 *   wrong shape is an ordinary outcome and one broken tile should not take a dashboard with it;
 * - refuses a misconfigured declaration at the point of declaration, naming the widget and the
 *   option, rather than rendering `undefined` into a tile.
 *
 * They are also, in the end, thin: each maps a host's rows onto a shape the package already knows
 * how to draw, and the mapping is the whole of it. A host that needs something the package cannot
 * express still writes a widget, and that is the intended way to extend this.
 *
 * A declaration is a plain object with no hooks, no directive and no state, so a server component
 * can build a registry of these and render it through `AdminWidgetPanel`. The exception is the chart
 * pair, which is a client module because the charts themselves are, and which therefore have to be
 * declared in a client module.
 */

export { adminActivityAge, adminActivityWidget } from "./activity.js";
export type { AdminActivityWidgetOptions } from "./activity.js";
export { adminChartWidget, adminRankWidget } from "./chart-widget.js";
export type { AdminChartWidgetOptions, AdminRankWidgetOptions } from "./chart-widget.js";
export { adminListWidget } from "./list.js";
export type { AdminListWidgetItem, AdminListWidgetOptions } from "./list.js";
export { adminStatWidget } from "./stat.js";
export type { AdminStatWidgetOptions } from "./stat.js";
export { adminTableWidget } from "./table.js";
export type { AdminTableWidgetColumn, AdminTableWidgetOptions } from "./table.js";
export {
  adminWidgetCapNote,
  adminWidgetCappedRows,
  adminWidgetRequired,
  adminWidgetRequiredList,
  adminWidgetRowKey,
  adminWidgetRows,
} from "./values.js";
export type { AdminWidgetCap, AdminWidgetCappedRows, AdminWidgetEmptyCopy } from "./values.js";
