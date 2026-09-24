// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  filterNavGroups,
  findNavItemAt,
  flattenNavItems,
  isActiveHref,
  type AdminNavGroup,
} from "../src/adapters";

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
