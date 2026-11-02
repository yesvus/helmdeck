// SPDX-License-Identifier: MIT

import { defineAdminWidget } from "../widgets/registry.js";
import type { AdminWidgetDefinition } from "../widgets/types.js";
import type { AdminNavGroup } from "../adapters/nav.js";
import type { AdminSettingsGroup } from "../settings/contract.js";
import type { AdminCommandPaletteCommand } from "../primitives/command-palette.js";

export type AdminPluginDefinition = {
  id?: string;
  navGroups?: readonly AdminNavGroup[];
  widgets?: readonly AdminWidgetDefinition<never>[];
  settingsGroups?: readonly AdminSettingsGroup[];
  paletteEntries?: readonly AdminCommandPaletteCommand[];
};

export type AdminPlugin = {
  id?: string;
  navGroups: AdminNavGroup[];
  widgets: AdminWidgetDefinition<never>[];
  settingsGroups: AdminSettingsGroup[];
  paletteEntries: AdminCommandPaletteCommand[];
};

function navGroupId(group: AdminNavGroup): string {
  const id = (group as { id?: unknown }).id;
  if (typeof id === "string" && id.trim() !== "") return id;
  if (typeof group.label !== "string" || group.label.trim() === "") {
    throw new Error("A nav group needs a non-empty id or label");
  }
  return group.label;
}

function cloneNavGroup(group: AdminNavGroup): AdminNavGroup {
  return { ...group, items: [...group.items] };
}

export function composeAdminPlugins(input: AdminPluginDefinition | readonly AdminPluginDefinition[]): AdminPlugin {
  if (input === null || typeof input !== "object") {
    throw new Error("An admin plugin needs a definition object");
  }
  const definitions = Array.isArray(input) ? input : [input];
  const normalized = definitions as readonly AdminPluginDefinition[];

  const navGroups: AdminNavGroup[] = [];
  const navSeen = new Set<string>();
  const widgets: AdminWidgetDefinition<never>[] = [];
  const widgetSeen = new Set<string>();
  const settingsGroups: AdminSettingsGroup[] = [];
  const settingsGroupSeen = new Set<string>();
  const settingSeen = new Set<string>();
  const paletteEntries: AdminCommandPaletteCommand[] = [];
  const paletteSeen = new Set<string>();

  for (const definition of normalized) {
    if (definition === null || typeof definition !== "object") {
      throw new Error("An admin plugin needs a definition object");
    }
    for (const [name, collection] of Object.entries({
      navGroups: definition.navGroups,
      widgets: definition.widgets,
      settingsGroups: definition.settingsGroups,
      paletteEntries: definition.paletteEntries,
    })) {
      if (collection !== undefined && !Array.isArray(collection)) {
        throw new Error(`An admin plugin ${name} contribution needs an array`);
      }
    }
    if (definition.navGroups) {
      for (const group of definition.navGroups) {
        if (!group || typeof group !== "object" || !Array.isArray(group.items)) {
          throw new Error("A nav group needs an items array");
        }
        const id = navGroupId(group);
        if (navSeen.has(id)) {
          throw new Error(`Two nav groups are both registered as "${id}"`);
        }
        navSeen.add(id);
        navGroups.push(cloneNavGroup(group));
      }
    }

    if (definition.widgets) {
      for (const widget of definition.widgets) {
        const defined = defineAdminWidget(widget);
        if (widgetSeen.has(defined.id)) {
          throw new Error(`Two widgets are both registered as "${defined.id}"`);
        }
        widgetSeen.add(defined.id);
        widgets.push(defined);
      }
    }

    if (definition.settingsGroups) {
      for (const group of definition.settingsGroups) {
        if (!group || typeof group !== "object" || typeof group.key !== "string" || group.key.trim() === "") {
          throw new Error("A settings group needs a key");
        }
        if (!Array.isArray(group.settings)) {
          throw new Error(`Settings group "${group.key}" needs a settings array`);
        }
        if (settingsGroupSeen.has(group.key)) {
          throw new Error(`Two settings groups are both registered as "${group.key}"`);
        }
        settingsGroupSeen.add(group.key);
        const settings = [];
        for (const setting of group.settings) {
          if (!setting || typeof setting !== "object" || typeof setting.key !== "string" || setting.key.trim() === "") {
            throw new Error(`Settings group "${group.key}" contains a setting without a key`);
          }
          if (settingSeen.has(setting.key)) {
            throw new Error(`Two settings are both registered as "${setting.key}"`);
          }
          settingSeen.add(setting.key);
          settings.push({ ...setting });
        }
        settingsGroups.push({ ...group, settings });
      }
    }

    if (definition.paletteEntries) {
      for (const entry of definition.paletteEntries) {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || entry.id.trim() === "") {
          throw new Error("A palette entry needs an id");
        }
        if (paletteSeen.has(entry.id)) {
          throw new Error(`Two palette entries are both registered as "${entry.id}"`);
        }
        paletteSeen.add(entry.id);
        paletteEntries.push({ ...entry });
      }
    }
  }

  const id =
    normalized.length === 1 ? normalized[0].id : undefined;

  return { id, navGroups, widgets, settingsGroups, paletteEntries };
}

export function defineAdminPlugin(input: AdminPluginDefinition | readonly AdminPluginDefinition[]): AdminPlugin {
  return composeAdminPlugins(input);
}

export const composeAdminPlugin = composeAdminPlugins;
