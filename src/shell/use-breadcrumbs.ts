// SPDX-License-Identifier: MIT
import { usePathname } from "next/navigation";
import type { AdminNavGroup, AdminNavItem } from "../adapters/index.js";
import { findNavItemAt, getAdminHrefPathname } from "../adapters/index.js";
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
  const normalizedPath = path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const item = findNavItemAt(nav, normalizedPath);

  if (!item) {
    return null;
  }

  const items = nav.flatMap((group) => group.items);
  const segments = normalizedPath.split("/").filter(Boolean);
  const crumbs: AdminBreadcrumbTrail["crumbs"] = [];
  let accumulated = "";
  for (const [index, segment] of segments.entries()) {
    accumulated += `/${segment}`;
    const match = items.find((candidate) => {
      const candidatePath = getAdminHrefPathname(candidate.href).replace(/\/+$/, "") || "/";
      return candidatePath === accumulated;
    });
    if (match || accumulated.startsWith(getAdminHrefPathname(item.href).replace(/\/+$/, ""))) {
      crumbs.push({ label: match?.label ?? segment, href: match?.href, current: index === segments.length - 1 });
    }
  }
  if (crumbs.length === 0) crumbs.push({ label: item.label, href: item.href, current: true });
  if (!crumbs.some((crumb) => crumb.current)) crumbs[crumbs.length - 1] = { ...crumbs.at(-1)!, current: true };
  return { item, crumbs };
}
