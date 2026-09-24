// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn.js";
import type { AdminNavItem } from "../adapters/index.js";
import { getAdminHrefPathname, isActiveHref } from "../adapters/index.js";
import { resolveNavIcon } from "./nav-icons.js";
import { useAdminShell } from "./context.js";

export function isAdminNavItemActive(pathname: string, href: string, homeHref?: string) {
  const navPath = normalizeRoutePath(href);
  const homePath = homeHref === undefined ? undefined : normalizeRoutePath(homeHref);
  if (navPath !== homePath) return isActiveHref(pathname, href);
  return normalizeRoutePath(pathname) === navPath;
}

function normalizeRoutePath(value: string) {
  const path = getAdminHrefPathname(value).replace(/\/+$/, "");
  return path || "/";
}

export function AdminNavLink({
  item,
  compact = false,
  iconOnly = false,
  exact = false,
}: {
  item: AdminNavItem;
  compact?: boolean;
  iconOnly?: boolean;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const shell = useAdminShell();
  const active = exact
    ? isAdminNavItemActive(pathname, item.href, item.href)
    : isAdminNavItemActive(pathname, item.href, shell?.homeHref);
  const Icon = resolveNavIcon(item.icon);
  const label = iconOnly || compact ? (item.shortLabel ?? item.label) : item.label;

  if (compact) {
    return (
      <Link
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-3 text-center text-[11px] font-semibold transition-colors",
          active ? "text-admin-brand-text" : "text-zinc-500 hover:text-zinc-900",
        )}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  if (iconOnly) {
    return (
      <Link
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-brand-500 text-admin-on-brand"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
        )}
      >
        {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
        active
          ? "bg-brand-500 text-admin-on-brand"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}
