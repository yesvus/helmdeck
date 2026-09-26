// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import { usePathname } from "next/navigation.js";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../cn.js";
import type { AdminNavIconComponent, AdminNavItem } from "../adapters/index.js";
import { getAdminHrefPathname, isActiveHref } from "../adapters/index.js";
import { resolveNavIcon } from "./nav-icons.js";
import { useAdminShell } from "./context.js";
import { useAdminHref } from "../i18n.js";

/**
 * Renders a nav icon from a component reference. The reference arrives as a prop, so the
 * JSX tag is not a value the compiler sees as constructed during render.
 */
function AdminNavItemIcon({ icon: Icon }: { icon: AdminNavIconComponent | null }) {
  if (!Icon) return null;
  return <Icon className="h-5 w-5 shrink-0" />;
}

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
  hideIcon = false,
  activeIndicator = false,
  exact = false,
}: {
  item: AdminNavItem;
  compact?: boolean;
  iconOnly?: boolean;
  hideIcon?: boolean;
  activeIndicator?: boolean;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const shell = useAdminShell();
  const toHref = useAdminHref();
  const href = toHref(item.href);
  const active = exact
    ? isAdminNavItemActive(pathname, href, href)
    : isAdminNavItemActive(pathname, href, shell?.homeHref ? toHref(shell.homeHref) : undefined);
  const Icon = resolveNavIcon(item.icon);
  const label = iconOnly || compact ? (item.shortLabel ?? item.label) : item.label;

  if (compact) {
    return (
      <Link
        href={href}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-3 text-center text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
          active
            // admin-theme-fixed: a light indicator bar over the brand fill, meant to read
            // the same in both themes.
            ? "bg-brand-500 !text-white after:absolute after:inset-x-3 after:top-0 after:h-0.5 after:rounded-b after:bg-white/70"
            : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
        )}
      >
        {Icon ? <AdminNavItemIcon icon={Icon} /> : null}
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  if (iconOnly) {
    return (
      <Link
        href={href}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface",
          active
            ? "bg-brand-500 !text-white ring-1 ring-inset ring-brand-500/30"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
        )}
      >
        {Icon ? <AdminNavItemIcon icon={Icon} /> : null}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-8 items-center rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-admin-surface",
        hideIcon ? "" : "gap-2.5",
        hideIcon
          ? active ? "text-zinc-900" : "text-zinc-600 hover:text-zinc-900"
          : active
            ? "font-semibold bg-brand-500 !text-white ring-1 ring-inset ring-brand-500/30"
            : "font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {hideIcon && active && activeIndicator ? (
        <motion.span
          aria-hidden="true"
          layoutId="admin-nav-active-indicator"
          className="pointer-events-none absolute -left-[10px] top-0 bottom-0 z-10 w-[3px] rounded-full bg-brand-500"
          transition={shouldReduceMotion ? { duration: 0 } : { type: "tween", duration: 0.16, ease: "easeOut" }}
        />
      ) : null}
      {!hideIcon && Icon ? <AdminNavItemIcon icon={Icon} /> : null}
      <motion.span
        className="truncate"
        animate={hideIcon ? { opacity: active ? 1 : 0.7 } : undefined}
        transition={shouldReduceMotion ? { duration: 0 } : { type: "tween", duration: 0.12, ease: "easeOut" }}
      >
        {label}
      </motion.span>
    </Link>
  );
}
