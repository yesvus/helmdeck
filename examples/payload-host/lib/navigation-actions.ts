// SPDX-License-Identifier: MIT
"use server";

import { createNavigationActions, type NavigationMenuItem, type ActionResult, type NavigationActionsDependencies } from "./navigation-actions-factory";

export type { NavigationMenuItem, ActionResult, NavigationActionsDependencies, NavigationTerm } from "./navigation-actions-factory";

let defaultActions: ReturnType<typeof createNavigationActions> | null = null;
async function getDefaultActions() {
  if (defaultActions) return defaultActions;
  const { readPayloadSession } = await import("./session");
  const { payloadInstance } = await import("./payload/content");
  const payload = await payloadInstance();
  defaultActions = createNavigationActions({
    sessionResolver: readPayloadSession as unknown as NavigationActionsDependencies["sessionResolver"],
    payload: payload as unknown as NavigationActionsDependencies["payload"],
  });
  return defaultActions;
}

export async function listNavigationItems(): Promise<NavigationMenuItem[]> {
  return (await getDefaultActions()).listNavigationItems();
}
export async function listNavigation(): Promise<NavigationMenuItem[]> {
  return (await getDefaultActions()).listNavigationItems();
}
export async function getNavigationMenu(): Promise<NavigationMenuItem[]> {
  return (await getDefaultActions()).listNavigationItems();
}
export async function saveNavigationMenu(items: unknown, pageSlugs?: string[]): Promise<ActionResult> {
  return (await getDefaultActions()).saveNavigationMenu(items, pageSlugs);
}
export async function saveNavigation(items: unknown, pageSlugs?: string[]): Promise<ActionResult> {
  return (await getDefaultActions()).saveNavigationMenu(items, pageSlugs);
}
export async function addNavigationItem(item: unknown, pageSlugs?: string[]): Promise<ActionResult> {
  return (await getDefaultActions()).addNavigationItem(item, pageSlugs);
}
export async function updateNavigationItem(id: string, patch: unknown, pageSlugs?: string[]): Promise<ActionResult> {
  return (await getDefaultActions()).updateNavigationItem(id, patch, pageSlugs);
}
export async function deleteNavigationItem(id: string): Promise<ActionResult> {
  return (await getDefaultActions()).deleteNavigationItem(id);
}
export async function listNavigationPages() {
  return (await getDefaultActions()).listPages();
}
export async function listTerms(collection: string) {
  return (await getDefaultActions()).listTerms(collection);
}
export async function createTerm(collection: string, label: string, slug: string): Promise<ActionResult> {
  return (await getDefaultActions()).createTerm(collection, label, slug);
}
export async function renameTerm(collection: string, id: string, label: string): Promise<ActionResult> {
  return (await getDefaultActions()).renameTerm(collection, id, label);
}
export async function deleteTerm(collection: string, id: string): Promise<ActionResult> {
  return (await getDefaultActions()).deleteTerm(collection, id);
}
