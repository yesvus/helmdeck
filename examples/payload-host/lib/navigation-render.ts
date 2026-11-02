// SPDX-License-Identifier: MIT

import type { NavigationMenuItem } from "./payload/menu";

export type NavigationLink = {
  label: string;
  href: string;
  external: boolean;
};

export function navigationItemsToLinks(items: readonly NavigationMenuItem[]): NavigationLink[] {
  return [...items]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((item) => {
      const label = item.label?.trim() || "Link";
      const href = item.targetKind === "internal"
        ? (item.internalPage ? `/${item.internalPage.replace(/^\/+/, "")}` : "#")
        : (item.url ?? "#");
      const external = item.targetKind === "url" && /^https?:\/\//i.test(href);
      return { label, href, external };
    });
}

export const renderNavigationLinks = navigationItemsToLinks;
export const navigationToLinks = navigationItemsToLinks;
export const menuItemsToLinks = navigationItemsToLinks;
