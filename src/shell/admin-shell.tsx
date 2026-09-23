"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AdminNavGroup, AdminSession } from "../adapters";
import { filterNavGroups } from "../adapters";
import { AdminBreadcrumbs } from "./admin-breadcrumbs";
import { AdminMobileNav } from "./admin-mobile-nav";
import { AdminNavLink } from "./admin-nav";
import { AdminProfileMenu } from "./admin-profile-menu";
import { AdminSearch, type AdminSearchEntry } from "./admin-search";
import { cn } from "./cn";
import { AdminShellProvider, type AdminShellBrand } from "./context";
import type { AdminShellLabels } from "./labels";
import { mergeAdminLabels } from "./labels";
import { useAdminBranding } from "../theme/branding";
import { useBreadcrumbs } from "./use-breadcrumbs";

export function AdminShell({
  nav,
  session = null,
  homeHref = "/admin",
  brand,
  labels,
  searchEntries,
  profileHref,
  viewSiteHref = "/",
  onLogout,
  topbarExtra,
  children,
}: {
  nav: AdminNavGroup[];
  session?: AdminSession | null;
  homeHref?: string;
  brand?: AdminShellBrand;
  labels?: Partial<AdminShellLabels>;
  searchEntries?: AdminSearchEntry[];
  profileHref?: string;
  viewSiteHref?: string;
  onLogout?: () => void;
  topbarExtra?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const mergedLabels = mergeAdminLabels(labels);
  const visibleNav = filterNavGroups(nav, session?.role);
  const branding = useAdminBranding(brand?.accent);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleNav.map((group) => [group.label, true])),
  );
  const trail = useBreadcrumbs(visibleNav);
  const resolvedProfileHref = profileHref ?? `${homeHref}/profile`;
  const brandHref = brand?.href ?? homeHref;
  const collapsedWidth = "var(--admin-sidebar-width-collapsed, 76px)";
  const expandedWidth = "var(--admin-sidebar-width, 260px)";

  const sidebarStyle = {
    ...branding,
    "--admin-sidebar-current": collapsed ? collapsedWidth : expandedWidth,
  } as CSSProperties;

  return (
    <AdminShellProvider
      value={{
        nav: visibleNav,
        session,
        labels: mergedLabels,
        collapsed,
        expandSidebar: () => setCollapsed(false),
        homeHref,
        profileHref: resolvedProfileHref,
        viewSiteHref,
        onLogout,
        searchEntries,
      }}
    >
      <main
        className="min-h-[100dvh] bg-zinc-50 text-zinc-900"
        style={sidebarStyle}
      >
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--admin-sidebar-current)] border-r border-zinc-200 bg-white transition-[width] duration-200 lg:block">
          <div className="flex h-full flex-col">
            <div
              className={cn(
                "flex h-[72px] shrink-0 items-center border-b border-zinc-100",
                collapsed ? "justify-center px-2" : "gap-2.5 px-4",
              )}
            >
              {collapsed ? null : (
                <Link
                  href={brandHref}
                  aria-label={brand?.label ?? mergedLabels.brandLabel}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  {brand?.logo ?? null}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {brand?.label ?? mergedLabels.brandLabel}
                  </span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => setCollapsed((current) => !current)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                aria-label={collapsed ? mergedLabels.sidebarExpand : mergedLabels.sidebarCollapse}
                title={collapsed ? mergedLabels.sidebarExpand : mergedLabels.sidebarCollapse}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
            </div>

            <AdminSearch
              groups={visibleNav}
              collapsed={collapsed}
              onExpand={() => setCollapsed(false)}
            />

            <nav className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
              {visibleNav.map((group) => {
                const containsActiveRoute = group.items.some((item) =>
                  item.href === pathname || pathname.startsWith(`${item.href}/`),
                );
                const isOpen = containsActiveRoute || openGroups[group.label] !== false;

                return (
                  <section key={group.label} className="mb-2">
                    {collapsed ? null : (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenGroups((current) => ({
                            ...current,
                            [group.label]: !current[group.label],
                          }))
                        }
                        aria-expanded={isOpen}
                        className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
                      >
                        {group.label}
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 transition-transform", isOpen ? "" : "-rotate-90")}
                        />
                      </button>
                    )}
                    <div className={collapsed || isOpen ? "space-y-1" : "hidden"}>
                      {group.items.map((item) => (
                        <AdminNavLink key={item.href} item={item} iconOnly={collapsed} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </nav>

            {session ? (
              <AdminProfileMenu email={session.email} compact={collapsed} />
            ) : null}
          </div>
        </aside>

        <div className="px-4 pb-24 pt-4 transition-[margin] duration-200 sm:px-5 lg:ml-[var(--admin-sidebar-current)] lg:px-6 lg:pb-6 xl:px-7">
          {trail || topbarExtra ? (
            <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
              <AdminBreadcrumbs groups={visibleNav} />
              {topbarExtra ? (
                <div className="flex items-center gap-2">{topbarExtra}</div>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-6">{children}</div>
        </div>

        <AdminMobileNav groups={visibleNav} />
      </main>
    </AdminShellProvider>
  );
}
