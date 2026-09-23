// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../cn";
import type { AdminNavItem } from "../adapters";
import { isActiveHref } from "../adapters";
import { resolveNavIcon } from "./nav-icons";

export function AdminNavLink({
  item,
  compact = false,
  iconOnly = false,
}: {
  item: AdminNavItem;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const pathname = usePathname();
  const active = isActiveHref(pathname, item.href);
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
          active ? "text-brand-600" : "text-zinc-500 hover:text-zinc-900",
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
            ? "bg-brand-500 text-white"
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
          ? "bg-brand-500 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}
