// SPDX-License-Identifier: MIT

import type { GlobalConfig } from "payload";
import { isAdmin, principal } from "../rules.ts";
import { AdminPayloadAccessRefused } from "@yesvus/helmdeck";

export const NAVIGATION_GLOBAL = "navigation";
export const NAVIGATION_MENU_GLOBAL = "navigation";
export const SITE_NAVIGATION_GLOBAL = "navigation";

export type NavigationTargetKind = "internal" | "url";

export type NavigationMenuItem = {
  id?: string;
  label: string;
  targetKind: NavigationTargetKind;
  internalPage?: string | null;
  url?: string | null;
  sortOrder: number;
};

export type NavigationMenu = {
  items: NavigationMenuItem[];
  updated_at?: string | null;
  updated_by?: string | null;
};

export type PayloadNavigationStore = {
  get: (slug: string) => Promise<unknown>;
  set: (slug: string, data: Record<string, unknown>) => Promise<unknown>;
};

export type PayloadNavigationOptions = {
  store: PayloadNavigationStore;
  resolveUser: () => Promise<{ id: string } | null>;
};

export type PayloadNavigationProblem = { key?: string; field?: string; reason?: string; message?: string };

const GLOBAL_SLUG = NAVIGATION_GLOBAL;

function itemsOf(doc: unknown): NavigationMenuItem[] {
  if (Array.isArray(doc)) return doc as NavigationMenuItem[];
  if (doc && typeof doc === "object") {
    const items = (doc as { items?: unknown }).items;
    if (Array.isArray(items)) return items as NavigationMenuItem[];
  }
  return [];
}

export function normaliseNavigationItem(item: unknown): NavigationMenuItem {
  const row = (item ?? {}) as Record<string, unknown>;
  const targetKind: NavigationTargetKind = row.targetKind === "internal" ? "internal" : "url";
  return {
    ...(typeof row.id === "string" ? { id: row.id } : {}),
    label: typeof row.label === "string" ? row.label.trim() : "",
    targetKind,
    internalPage: typeof row.internalPage === "string" ? row.internalPage.trim() || null : (row.internalPage ?? null) as string | null,
    url: typeof row.url === "string" ? row.url.trim() || null : (row.url ?? null) as string | null,
    sortOrder: typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
  };
}

export function normaliseNavigationItems(items: unknown): NavigationMenuItem[] {
  if (!Array.isArray(items)) return [];
  return items.map(normaliseNavigationItem);
}

export function urlIsValid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function validateNavigationItem(item: unknown, pageSlugs: string[] = []): PayloadNavigationProblem[] {
  const row = normaliseNavigationItem(item);
  const problems: PayloadNavigationProblem[] = [];
  if (!row.label) problems.push({ field: "label", message: "Label is required." });
  if (row.targetKind === "url") {
    if (!row.url || !urlIsValid(row.url)) problems.push({ field: "url", message: "A valid URL is required." });
  } else {
    if (!row.internalPage) problems.push({ field: "internalPage", message: "An internal page is required." });
    else if (pageSlugs.length > 0 && !pageSlugs.includes(row.internalPage)) {
      problems.push({ field: "internalPage", message: "That page does not exist." });
    }
  }
  return problems;
}

export function validateNavigationItems(items: unknown, pageSlugs: string[] = []): PayloadNavigationProblem[] {
  const list = normaliseNavigationItems(items);
  const problems: PayloadNavigationProblem[] = [];
  list.forEach((item, index) => {
    for (const problem of validateNavigationItem(item, pageSlugs)) {
      problems.push({ ...problem, key: `items.${index}.${problem.field ?? "item"}` });
    }
  });
  return problems;
}

export function validateNavigationMenu(values: Record<string, unknown>, pageSlugs: string[] = []): PayloadNavigationProblem[] {
  return validateNavigationItems(values.items ?? values.menuItems ?? values.links, pageSlugs);
}

// Pure reorder util.
export function reorderNavigationItems<T extends { id?: string } = NavigationMenuItem>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const byId = new Map(items.map((item, index) => [String((item as { id?: string }).id ?? index), item]));
  const ordered: T[] = [];
  const placed = new Set<string>();
  for (const id of orderedIds) {
    const item = byId.get(String(id));
    if (!item || placed.has(String(id))) continue;
    placed.add(String(id));
    ordered.push(item);
  }
  for (const item of items) {
    const id = String((item as { id?: string }).id ?? "");
    if (!placed.has(id)) ordered.push(item);
  }
  // Reassign sortOrder when present.
  return ordered.map((item, index) => {
    if (item && typeof item === "object" && "sortOrder" in (item as object)) {
      return { ...(item as object), sortOrder: index } as unknown as T;
    }
    return item;
  });
}

// Aliases.
export const reorderMenuItems = reorderNavigationItems;
export const reorderNavItems = reorderNavigationItems;
export const reorderItems = reorderNavigationItems;

export async function readPayloadNavigationMenu(options: PayloadNavigationOptions): Promise<NavigationMenuItem[]> {
  const user = await options.resolveUser();
  if (!user) throw new AdminPayloadAccessRefused("findGlobal");
  const doc = await options.store.get(GLOBAL_SLUG);
  return normaliseNavigationItems(itemsOf(doc)).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function writePayloadNavigationMenu(
  options: PayloadNavigationOptions,
  rawItems: unknown,
): Promise<NavigationMenu> {
  const user = await options.resolveUser();
  if (!user) throw new AdminPayloadAccessRefused("updateGlobal");
  const items = normaliseNavigationItems(rawItems).map((item, index) => ({ ...item, sortOrder: index }));
  const problems = validateNavigationItems(items);
  if (problems.length > 0) {
    throw new Error(problems.map((p) => `${p.field ?? "item"}: ${p.message}`).join("; "));
  }
  const written = await options.store.set(GLOBAL_SLUG, {
    items,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  const writtenDoc = written as { updated_at?: unknown; updated_by?: unknown } | null;
  return { items: normaliseNavigationItems(itemsOf(written)), updated_at: typeof writtenDoc?.updated_at === "string" ? writtenDoc.updated_at : null, updated_by: typeof writtenDoc?.updated_by === "string" ? writtenDoc.updated_by : null };
}

export function createPayloadNavigationMenu(options: PayloadNavigationOptions) {
  return {
    read: () => readPayloadNavigationMenu(options),
    write: (items: unknown) => writePayloadNavigationMenu(options, items),
    validate: (items: unknown, pageSlugs?: string[]) => validateNavigationItems(items as unknown, pageSlugs),
    global: GLOBAL_SLUG,
  };
}

export const navigationGlobal: GlobalConfig = {
  slug: GLOBAL_SLUG,
  label: "Navigation",
  access: {
    read: ({ req: { user } }) => isAdmin(principal(user)),
    update: ({ req: { user } }) => isAdmin(principal(user)),
  },
  fields: [
    {
      name: "items",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "targetKind", type: "select", required: true, defaultValue: "url", options: ["internal", "url"] },
        { name: "internalPage", type: "text" },
        { name: "url", type: "text" },
        { name: "sortOrder", type: "number", required: true, defaultValue: 0 },
      ],
    },
    { name: "updated_at", type: "text", required: false },
    { name: "updated_by", type: "text", required: false },
  ],
};

// Alias config name.
export const NavigationGlobal = navigationGlobal;
export const NavigationMenuGlobal = navigationGlobal;

export async function readPublicNavigationMenu() {
  const { payloadInstance } = await import("./content");
  const payload = await payloadInstance();
  const doc = await payload.findGlobal({ slug: NAVIGATION_GLOBAL, depth: 0, overrideAccess: true });
  return normaliseNavigationItems(
    (doc && typeof doc === "object" && Array.isArray((doc as { items?: unknown }).items))
      ? ((doc as { items: unknown[] }).items)
      : (Array.isArray(doc) ? doc : []),
  ).sort((a, b) => a.sortOrder - b.sortOrder);
}
