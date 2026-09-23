// SPDX-License-Identifier: MIT
import { usePathname } from "next/navigation";
import type { AdminNavGroup, AdminNavItem } from "../adapters";
import { findNavItemAt } from "../adapters";
import { useAdminShell } from "./context";

export type AdminBreadcrumbTrail = {
  item: AdminNavItem;
  remainder: string[];
};

export function useBreadcrumbs(
  groups?: AdminNavGroup[],
  pathnameOverride?: string,
): AdminBreadcrumbTrail | null {
  const shell = useAdminShell();
  const pathname = usePathname();
  const nav = groups ?? shell?.nav ?? [];
  const path = pathnameOverride ?? pathname;
  const item = findNavItemAt(nav, path);

  if (!item) {
    return null;
  }

  const remainder = path
    .slice(item.href.length)
    .split("/")
    .filter(Boolean);

  return { item, remainder };
}
