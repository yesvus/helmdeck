// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  filterNavGroups,
  findNavItemAt,
  flattenNavItems,
  isActiveHref,
  type AdminNavGroup,
} from "../src/adapters";
import { isAdminNavItemActive } from "../src/shell/admin-nav";

const nav: AdminNavGroup[] = [
  {
    label: "Content",
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/products", label: "Products" },
      { href: "/admin/settings", label: "Settings", roles: ["admin"] },
    ],
  },
  { label: "Empty", items: [{ href: "/admin/users", label: "Users", roles: ["owner"] }] },
];

describe("admin navigation utilities", () => {
  it("matches complete path segments only", () => {
    expect(isActiveHref("/admin/products/12", "/admin/products")).toBe(true);
    expect(isActiveHref("/admin/products/12", "/admin/products?locale=en")).toBe(true);
    expect(isActiveHref("/admin/products-archive", "/admin/products")).toBe(false);
    expect(isActiveHref("/admin/products/12/", "/admin/products/")).toBe(true);
    expect(isActiveHref("/admin/products/?view=grid", "/admin/products?view=list")).toBe(true);
    expect(isActiveHref("/admin/products/12", "/admin")).toBe(true);
  });

  it("activates the dashboard only at its exact route", () => {
    expect(isAdminNavItemActive("/shell", "/shell", "/shell")).toBe(true);
    expect(isAdminNavItemActive("/shell/", "/shell", "/shell")).toBe(true);
    expect(isAdminNavItemActive("/shell?tab=home", "/shell", "/shell")).toBe(true);
    expect(isAdminNavItemActive("/shell/products", "/shell", "/shell")).toBe(false);
    expect(isAdminNavItemActive("/shell/products/1", "/shell/products", "/shell")).toBe(true);
  });

  it("filters groups and removes empty groups", () => {
    expect(filterNavGroups(nav, "editor")).toEqual([{ ...nav[0], items: nav[0].items.slice(0, 2) }]);
  });

  it("finds the most specific active item", () => {
    const groups = [
      {
        label: "Content",
        items: [
          { href: "/admin", label: "Overview" },
          { href: "/admin/products", label: "Products" },
        ],
      },
    ];
    expect(findNavItemAt(groups, "/admin/products/new")?.label).toBe("Products");
    expect(flattenNavItems(groups)).toHaveLength(2);
  });
});
