// SPDX-License-Identifier: MIT
"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import Link from "next/link.js";
import { usePathname } from "next/navigation.js";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { AdminNavGroup, AdminSession } from "../adapters/index.js";
import { filterNavGroups } from "../adapters/index.js";
import { AdminBreadcrumbs } from "./admin-breadcrumbs.js";
import { AdminMobileNav } from "./admin-mobile-nav.js";
import { AdminNavLink, isAdminNavItemActive } from "./admin-nav.js";
import { resolveNavIcon } from "./nav-icons.js";
import { AdminProfileMenu } from "./admin-profile-menu.js";
import { AdminSearch, type AdminSearchEntry } from "./admin-search.js";
import { cn } from "../cn.js";
import { AdminShellProvider, type AdminShellBrand } from "./context.js";
import type { AdminShellLabels } from "./labels.js";
import { mergeAdminLabels } from "./labels.js";
import { useAdminBranding } from "../theme/branding.js";
import { useBreadcrumbs } from "./use-breadcrumbs.js";
import { useAdminHref, useAdminMessages } from "../i18n.js";

export function AdminShell({
  nav,
  session = null,
  homeHref = "/admin",
  brand,
  labels,
  searchEntries,
  searchNormalize,
  resolveBreadcrumbSegment,
  currentPageTitle,
  profileHref,
  viewSiteHref = "/",
  onLogout,
  contentScrollRef,
  profileMenuExtra,
  showTopbar = true,
  topbarExtra,
  sidebarExtra,
  children,
}: {
  nav: AdminNavGroup[];
  session?: AdminSession | null;
  homeHref?: string;
  brand?: AdminShellBrand;
  labels?: Partial<AdminShellLabels>;
  searchEntries?: AdminSearchEntry[];
  searchNormalize?: (value: string) => string;
  resolveBreadcrumbSegment?: (segment: string, labels: AdminShellLabels) => string;
  currentPageTitle?: string;
  profileHref?: string;
  viewSiteHref?: string;
  onLogout?: () => void | Promise<void>;
  contentScrollRef?: Ref<HTMLDivElement>;
  profileMenuExtra?: ReactNode;
  showTopbar?: boolean;
  topbarExtra?: ReactNode;
  sidebarExtra?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const i18n = useAdminMessages();
  const toHref = useAdminHref();
  const mergedLabels = mergeAdminLabels({ ...i18n.shell, ...labels });
  const resolvedSearchNormalize = useCallback(
    (value: string) =>
      searchNormalize
        ? searchNormalize(value)
        : value.toLocaleLowerCase(i18n.searchLocale).normalize("NFKD"),
    [i18n.searchLocale, searchNormalize],
  );
  const visibleNav = filterNavGroups(nav, session?.role);
  const branding = useAdminBranding(brand?.accent);
  const [collapsed, setCollapsed] = useState(false);
  const internalContentScrollRef = useRef<HTMLDivElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visibleNav.map((group, index) => [group.label, index === 0])),
  );
  const trail = useBreadcrumbs(nav);
  const pageTitle = currentPageTitle ?? trail?.item.label;
  const resolvedProfileHref = toHref(profileHref ?? `${homeHref}/profile`);
  const brandHref = toHref(brand?.href ?? homeHref);
  const collapsedWidth = "var(--admin-sidebar-width-collapsed, 76px)";
  const expandedWidth = "var(--admin-sidebar-width, 240px)";

  // Writing to the local ref is fine. A host callback is invoked directly, because
  // calling a prop function is not a mutation, and that keeps it correct across remounts.
  // The ref-object form cannot be assigned from a closure, so React performs the write.
  const setContentScrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      internalContentScrollRef.current = element;
      if (typeof contentScrollRef !== "function") {
        return;
      }
      // React 19 lets a callback ref return a cleanup, which runs on detach instead of a
      // second call with null. The host owns that contract, so it is passed straight
      // through rather than flattened into a null call.
      const cleanup = contentScrollRef(element);
      if (typeof cleanup === "function") {
        return () => {
          internalContentScrollRef.current = null;
          cleanup();
        };
      }
      return undefined;
    },
    [contentScrollRef],
  );

  // React tracks the ref argument itself, so an empty dependency list still re-runs when
  // the host swaps to a different ref object.
  useImperativeHandle(
    typeof contentScrollRef === "function" ? undefined : contentScrollRef,
    () => internalContentScrollRef.current as HTMLDivElement,
    [],
  );

  useEffect(() => {
    internalContentScrollRef.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  const sidebarStyle = {
    ...branding,
    "--admin-sidebar-current": collapsed ? collapsedWidth : expandedWidth,
  } as CSSProperties;

  return (
    <AdminShellProvider
      value={{
        nav: visibleNav,
        currentPageTitle: showTopbar ? pageTitle : undefined,
        session,
        labels: mergedLabels,
        collapsed,
        expandSidebar: () => setCollapsed(false),
        homeHref,
        profileHref: resolvedProfileHref,
        viewSiteHref,
        onLogout,
        searchEntries,
        searchNormalize: resolvedSearchNormalize,
        resolveBreadcrumbSegment,
      }}
    >
      <main
        className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-50 text-zinc-900 print:h-auto print:min-h-0 print:overflow-visible"
        style={sidebarStyle}
      >
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--admin-sidebar-current)] border-r border-zinc-200 bg-admin-surface transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:block print:hidden">
          <div className="flex h-full flex-col">
            <div
              className={cn(
                "flex h-[var(--admin-header-height)] shrink-0 items-center border-b border-zinc-100",
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

            <nav className={cn("flex-1 overflow-y-auto py-2", collapsed ? "px-2" : "px-2.5")}>
              <LayoutGroup id="admin-sidebar-navigation">
                {visibleNav.map((group) => {
                  const activeItem = group.items
                    .filter((item) => isAdminNavItemActive(pathname, item.href, item.href === homeHref ? homeHref : undefined))
                    .sort((a, b) => b.href.length - a.href.length)[0];
                  const GroupIcon = resolveNavIcon(group.icon);
                  const isOpen = openGroups[group.label] !== false;

                  return (
                    <section key={group.label} className="mb-1">
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
                          className={cn(
                            "mb-0.5 flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
                            activeItem && "text-admin-brand-text",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              {GroupIcon ? <GroupIcon className={cn("h-4 w-4 shrink-0", activeItem ? "text-brand-600" : "text-zinc-500")} aria-hidden="true" /> : activeItem ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" /> : null}
                              <span className="truncate">{group.label}</span>
                            </span>
                          </span>
                          <ChevronDown
                            className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-in-out motion-reduce:transition-none", isOpen ? "" : "-rotate-90")}
                          />
                        </button>
                      )}
                      <motion.div
                        aria-hidden={!collapsed && !isOpen}
                        inert={!collapsed && !isOpen}
                        initial={false}
                        animate={{
                          height: collapsed || isOpen ? "auto" : 0,
                          opacity: collapsed || isOpen ? 1 : 0,
                        }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className={cn(
                          "relative overflow-hidden",
                          !collapsed && "ml-2 border-l pl-2 transition-colors duration-200 motion-reduce:transition-none",
                          !collapsed && (isOpen ? "border-zinc-200" : "border-transparent"),
                        )}
                      >
                        <div className="space-y-0.5">
                          {group.items.map((item) => (
                            <AdminNavLink key={item.href} item={item} iconOnly={collapsed} hideIcon={!collapsed} activeIndicator={!collapsed} exact={item.href === homeHref} />
                          ))}
                        </div>
                      </motion.div>
                    </section>
                  );
                })}
              </LayoutGroup>
            </nav>

            {sidebarExtra ? (
              <div className={cn("px-3 pb-3", collapsed && "px-2")}>{sidebarExtra}</div>
            ) : null}

            {session ? (
              <AdminProfileMenu email={session.email} compact={collapsed} menuExtra={profileMenuExtra} />
            ) : null}
          </div>
        </aside>

        {showTopbar ? (
          <header className="flex h-[var(--admin-header-height)] shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-admin-surface px-4 py-2 transition-[margin] duration-200 sm:px-5 lg:ml-[var(--admin-sidebar-current)] lg:px-6 xl:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                {trail && pageTitle ? <AdminBreadcrumbs groups={nav} /> : null}
                {pageTitle ? (
                  <h1 className="truncate text-sm font-semibold text-zinc-900">{pageTitle}</h1>
                ) : !trail ? (
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {brand?.label ?? mergedLabels.brandLabel}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {topbarExtra ? (
                <div className="flex items-center justify-end gap-2">{topbarExtra}</div>
              ) : null}
            </div>
          </header>
        ) : null}

        <div
          ref={setContentScrollRef}
          role="region"
          tabIndex={0}
          aria-label={pageTitle ?? brand?.label ?? mergedLabels.brandLabel}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-6 transition-[margin] duration-200 print:min-h-0 print:flex-none print:overflow-visible sm:px-5 lg:ml-[var(--admin-sidebar-current)] lg:px-6 lg:pb-6 xl:px-7"
        >
          <div className="space-y-6">{children}</div>
        </div>

        <div className="print:hidden"><AdminMobileNav groups={visibleNav} /></div>
      </main>
    </AdminShellProvider>
  );
}
