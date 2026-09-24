// SPDX-License-Identifier: MIT
import type { ComponentType } from "react";

export type AdminNavIconComponent = ComponentType<{ className?: string }>;

export type AdminNavIconName =
  | "activity"
  | "article"
  | "bell"
  | "briefcase"
  | "calendar"
  | "chart"
  | "clock"
  | "database"
  | "file"
  | "flag"
  | "folder"
  | "globe"
  | "help"
  | "image"
  | "info"
  | "language"
  | "mail"
  | "map"
  | "media"
  | "overview"
  | "palette"
  | "product"
  | "scale"
  | "search"
  | "settings"
  | "share"
  | "shield"
  | "sparkles"
  | "store"
  | "tag"
  | "trash"
  | "users"
  | "wrench";

export type AdminNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon?: AdminNavIconName | AdminNavIconComponent;
  roles?: string[];
  mobilePrimary?: boolean;
  keywords?: string[];
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export function getAdminHrefPathname(href: string) {
  return href.split(/[?#]/, 1)[0] || href;
}

export function isActiveHref(pathname: string, href: string): boolean {
  const path = getAdminHrefPathname(pathname);
  const hrefPath = getAdminHrefPathname(href);
  if (path === hrefPath) {
    return true;
  }
  const prefix = hrefPath.endsWith("/") ? hrefPath : `${hrefPath}/`;
  return path.startsWith(prefix);
}

export function isNavItemVisible(item: AdminNavItem, role?: string): boolean {
  if (!item.roles?.length) {
    return true;
  }
  return role !== undefined && item.roles.includes(role);
}

export function filterNavGroups(groups: AdminNavGroup[], role?: string): AdminNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavItemVisible(item, role)),
    }))
    .filter((group) => group.items.length > 0);
}

export function flattenNavItems(groups: AdminNavGroup[]): AdminNavItem[] {
  return groups.flatMap((group) => group.items);
}

export function findNavItemAt(groups: AdminNavGroup[], pathname: string): AdminNavItem | undefined {
  return flattenNavItems(groups)
    .filter((item) => isActiveHref(pathname, item.href))
    .sort((a, b) => getAdminHrefPathname(b.href).length - getAdminHrefPathname(a.href).length)[0];
}
