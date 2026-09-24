// SPDX-License-Identifier: MIT
import { usePathname } from "next/navigation";
import type { AdminNavGroup, AdminNavItem } from "../adapters/index.js";
import { getAdminHrefPathname } from "../adapters/index.js";
import { useAdminShell } from "./context.js";

export type AdminBreadcrumbTrail = {
  item: AdminNavItem;
  crumbs: { label: string; href?: string; current?: boolean }[];
};

export function useBreadcrumbs(
  groups?: AdminNavGroup[],
  pathnameOverride?: string,
): AdminBreadcrumbTrail | null {
  const shell = useAdminShell();
  const pathname = usePathname();
  const nav = groups ?? shell?.nav ?? [];
  const path = pathnameOverride ?? pathname;
  return path === null ? null : createAdminBreadcrumbTrail(nav, path);
}

export function createAdminBreadcrumbTrail(
  nav: AdminNavGroup[],
  pathname: string,
): AdminBreadcrumbTrail | null {
  const normalizedPath = normalizePath(pathname);
  const items = nav.flatMap((group) => group.items);
  const item = items
    .filter((candidate) => {
      const candidatePath = normalizePath(getAdminHrefPathname(candidate.href));
      return normalizedPath === candidatePath || normalizedPath.startsWith(candidatePath === "/" ? "/" : `${candidatePath}/`);
    })
    .sort((a, b) => normalizePath(getAdminHrefPathname(b.href)).length - normalizePath(getAdminHrefPathname(a.href)).length)[0];

  if (!item) {
    return null;
  }

  const itemPath = normalizePath(getAdminHrefPathname(item.href));
  const segments = normalizedPath.split("/").filter(Boolean);
  const crumbs: AdminBreadcrumbTrail["crumbs"] = [];
  if (itemPath === "/" && normalizedPath !== "/") {
    const rootItem = items.find((candidate) => normalizePath(getAdminHrefPathname(candidate.href)) === "/");
    if (rootItem) crumbs.push({ label: rootItem.label, href: rootItem.href });
  }
  let accumulated = "";
  for (const [index, segment] of segments.entries()) {
    accumulated += `/${segment}`;
    const match = items.find((candidate) => normalizePath(getAdminHrefPathname(candidate.href)) === accumulated);
    if (match || accumulated === itemPath || accumulated.startsWith(itemPath === "/" ? "/" : `${itemPath}/`)) {
      crumbs.push({ label: match?.label ?? segment, href: match?.href, current: index === segments.length - 1 });
    }
  }
  if (crumbs.length === 0) crumbs.push({ label: item.label, href: item.href, current: true });
  if (!crumbs.some((crumb) => crumb.current)) crumbs[crumbs.length - 1] = { ...crumbs.at(-1)!, current: true };
  return { item, crumbs };
}

function normalizePath(path: string) {
  return path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
}
