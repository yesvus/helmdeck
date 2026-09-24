// SPDX-License-Identifier: MIT
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminNavGroup } from "../src/adapters";

const { getPathname } = vi.hoisted(() => ({ getPathname: vi.fn<() => string | null>() }));
vi.mock("next/navigation", () => ({ usePathname: getPathname }));

import { AdminBreadcrumbs } from "../src/shell/admin-breadcrumbs";
import { createAdminBreadcrumbTrail } from "../src/shell/use-breadcrumbs";

const nav: AdminNavGroup[] = [{
  label: "Admin",
  items: [
    { href: "/shell/", label: "Dashboard" },
    { href: "/shell/settings/", label: "Settings" },
  ],
}];

describe("admin breadcrumbs", () => {
  beforeEach(() => getPathname.mockReturnValue("/shell/"));

  it("returns no trail when the pathname is unavailable during prerendering", () => {
    getPathname.mockReturnValue(null);
    expect(renderToStaticMarkup(<AdminBreadcrumbs groups={nav} />)).toBe("");
  });

  it("normalizes configured trailing slashes and matches only complete route segments", () => {
    expect(createAdminBreadcrumbTrail(nav, "/shell/settings/?tab=general#top")?.crumbs).toEqual([
      { label: "Dashboard", href: "/shell/", current: false },
      { label: "Settings", href: "/shell/settings/", current: true },
    ]);

    const partialSegmentNav: AdminNavGroup[] = [{
      label: "Routes",
      items: [
        { href: "/shell", label: "Dashboard" },
        { href: "/shell/settings", label: "Settings" },
        { href: "/shell/setting-up", label: "Setup" },
      ],
    }];
    expect(createAdminBreadcrumbTrail(partialSegmentNav, "/shell/setting-updates")?.item.label).toBe("Dashboard");
    expect(createAdminBreadcrumbTrail(partialSegmentNav, "/shell/settings-extra")?.item.label).toBe("Dashboard");
  });

  it("keeps unmatched intermediate route segments in the trail", () => {
    const routeNav: AdminNavGroup[] = [{
      label: "Admin",
      items: [
        { href: "/shell", label: "Dashboard" },
        { href: "/shell/settings", label: "Settings" },
      ],
    }];
    expect(createAdminBreadcrumbTrail(routeNav, "/shell/settings/site")?.crumbs.map(({ label }) => label)).toEqual([
      "Dashboard",
      "Settings",
      "site",
    ]);
  });

  it("includes a root navigation item as an ancestor of matched child routes", () => {
    const rootNav: AdminNavGroup[] = [{
      label: "Admin",
      items: [
        { href: "/", label: "Dashboard" },
        { href: "/settings", label: "Settings" },
      ],
    }];

    expect(createAdminBreadcrumbTrail(rootNav, "/settings/profile")?.crumbs.map(({ label }) => label)).toEqual([
      "Dashboard",
      "Settings",
      "profile",
    ]);
    expect(createAdminBreadcrumbTrail(rootNav, "/")?.crumbs).toEqual([
      { label: "Dashboard", href: "/", current: true },
    ]);
  });

  it("includes the root navigation item for unmatched child routes", () => {
    const rootNav: AdminNavGroup[] = [{
      label: "Admin",
      items: [{ href: "/", label: "Dashboard" }],
    }];

    expect(createAdminBreadcrumbTrail(rootNav, "/reports/monthly")?.crumbs).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "reports", href: undefined, current: false },
      { label: "monthly", href: undefined, current: true },
    ]);
  });

  it("hides a redundant one-item crumb and retains current-page semantics", () => {
    const markup = renderToStaticMarkup(<AdminBreadcrumbs groups={nav} />);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Dashboard");
    expect(markup).toContain("sr-only");
  });
});
