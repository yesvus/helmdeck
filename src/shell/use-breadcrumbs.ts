// SPDX-License-Identifier: MIT
"use client";

import { usePathname } from "next/navigation.js";
import type { AdminNavGroup, AdminNavItem } from "../adapters/index.js";
import { getAdminHrefPathname } from "../adapters/index.js";
import { useAdminShell } from "./context.js";

export type AdminBreadcrumbTrail = {
  item: AdminNavItem;
  crumbs: { label: string; href?: string; current?: boolean }[];
};

type NavEntry = { group: AdminNavGroup; item: AdminNavItem };

export function useBreadcrumbs(
  groups?: AdminNavGroup[],
  pathnameOverride?: string,
): AdminBreadcrumbTrail | null {
  const shell = useAdminShell();
  const pathname = usePathname();
  const nav = groups ?? shell?.nav ?? [];
  const path = pathnameOverride ?? pathname;
  return path === null ? null : createAdminBreadcrumbTrail(nav, path, shell?.homeHref);
}

export function createAdminBreadcrumbTrail(
  nav: AdminNavGroup[],
  pathname: string,
  homeHref?: string,
): AdminBreadcrumbTrail | null {
  const normalizedPath = normalizePath(pathname);
  const entries = nav.flatMap((group) => group.items.map((item) => ({ group, item })));
  const matched = entries
    .filter((entry) => {
      const candidatePath = itemPath(entry.item);
      return normalizedPath === candidatePath || normalizedPath.startsWith(candidatePath === "/" ? "/" : `${candidatePath}/`);
    })
    .sort((a, b) => itemPath(b.item).length - itemPath(a.item).length)[0];

  if (!matched) {
    return null;
  }

  const item = matched.item;
  const crumbs: AdminBreadcrumbTrail["crumbs"] = nav.length > 1
    ? sectionCrumbs(entries, matched, normalizedPath, homeHref)
    : flatCrumbs(entries, item, normalizedPath);

  if (crumbs.length === 0) crumbs.push({ label: item.label, href: item.href, current: true });
  if (!crumbs.some((crumb) => crumb.current)) crumbs[crumbs.length - 1] = { ...crumbs.at(-1)!, current: true };
  return { item, crumbs };
}

/**
 * A grouped navigation places a page in a section, so the section leads the trail and takes the
 * place of the root item the flat trail starts from.
 */
function sectionCrumbs(
  entries: NavEntry[],
  matched: NavEntry,
  normalizedPath: string,
  homeHref?: string,
): AdminBreadcrumbTrail["crumbs"] {
  const crumbs: AdminBreadcrumbTrail["crumbs"] = [];
  const item = matched.item;
  const dashboard = findDashboard(entries, homeHref);
  const onDashboard = dashboard !== undefined && itemPath(dashboard.item) === normalizedPath;
  if (onDashboard) {
    crumbs.push({ label: item.label, href: item.href, current: true });
    return crumbs;
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  const remaining = segments.slice(itemPath(item).split("/").filter(Boolean).length);
  // A section has no route of its own, so it names the place the way the sidebar section does.
  crumbs.push({ label: matched.group.label });
  if (!dashboard || itemPath(dashboard.item) !== itemPath(item)) {
    crumbs.push({ label: item.label, href: item.href, current: remaining.length === 0 });
  }
  for (const [index, segment] of remaining.entries()) {
    crumbs.push({ label: segment, current: index === remaining.length - 1 });
  }
  return crumbs;
}

/**
 * A navigation that is not grouped keeps the flat trail: the root item, then every item and path
 * segment the route passes through.
 */
function flatCrumbs(
  entries: NavEntry[],
  item: AdminNavItem,
  normalizedPath: string,
): AdminBreadcrumbTrail["crumbs"] {
  const crumbs: AdminBreadcrumbTrail["crumbs"] = [];
  const itemPathValue = itemPath(item);
  const segments = normalizedPath.split("/").filter(Boolean);
  if (normalizedPath !== "/") {
    const rootItem = entries.find((entry) => itemPath(entry.item) === "/");
    if (rootItem) crumbs.push({ label: rootItem.item.label, href: rootItem.item.href });
  }
  let accumulated = "";
  for (const [index, segment] of segments.entries()) {
    accumulated += `/${segment}`;
    const match = entries.find((entry) => itemPath(entry.item) === accumulated);
    if (match || accumulated === itemPathValue || accumulated.startsWith(itemPathValue === "/" ? "/" : `${itemPathValue}/`)) {
      crumbs.push({ label: match?.item.label ?? segment, href: match?.item.href, current: index === segments.length - 1 });
    }
  }
  return crumbs;
}

function findDashboard(entries: NavEntry[], homeHref?: string): NavEntry | undefined {
  if (homeHref) {
    const home = entries.find((entry) => itemPath(entry.item) === normalizePath(getAdminHrefPathname(homeHref)));
    if (home) return home;
  }
  return entries.find((entry) => itemPath(entry.item) === "/");
}

function itemPath(item: AdminNavItem) {
  return normalizePath(getAdminHrefPathname(item.href));
}

function normalizePath(path: string) {
  return path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}
