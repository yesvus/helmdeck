// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { buildAdminUrlPath, resolveAdminUrlHierarchy, type AdminUrlHierarchyNode } from "../src/shell/url-segments";

const hierarchy: AdminUrlHierarchyNode[] = [{
  segment: "admin",
  label: "Admin",
  children: [{
    segment: "categories",
    label: "Categories",
    children: [{
      segment: "edebiyat",
      label: "Edebiyat",
      children: [{ segment: "roman", label: "Roman" }],
    }],
  }],
}];

describe("hierarchical admin URL segments", () => {
  it("builds and resolves multi-level, locale-neutral slugs", () => {
    const path = buildAdminUrlPath([
      { segment: "admin", label: "Yönetim" },
      { segment: "categories", label: "Kategoriler" },
      { segment: "edebiyat", label: "Edebiyat" },
      { segment: "roman", label: "Roman" },
    ], { segment: "482-kitap-adi", id: "482" });
    expect(path).toBe("/admin/categories/edebiyat/roman/482-kitap-adi");
    expect(resolveAdminUrlHierarchy(path, hierarchy, /^\d+-/)).toMatchObject({
      recordId: "482-kitap-adi",
      crumbs: [
        { label: "Admin" }, { label: "Categories" }, { label: "Edebiyat" }, { label: "Roman" }, { label: "482-kitap-adi", current: true },
      ],
    });
    expect(resolveAdminUrlHierarchy(path, hierarchy, /^\d+-/)).toMatchObject({ pathname: path, recordId: "482-kitap-adi" });
  });

  it("resolves a truncated path to its parent view", () => {
    expect(resolveAdminUrlHierarchy("/admin/categories/edebiyat/roman", hierarchy)?.crumbs.at(-1)).toMatchObject({
      label: "Roman", current: true,
    });
  });

  it("backtracks through nested view levels when trailing segments are removed", () => {
    expect(resolveAdminUrlHierarchy("/admin/categories/edebiyat/roman", hierarchy)?.crumbs.at(-1)).toMatchObject({ label: "Roman", current: true });
    expect(resolveAdminUrlHierarchy("/admin/categories/edebiyat", hierarchy)?.crumbs.at(-1)).toMatchObject({ label: "Edebiyat", current: true });
  });

  it("does not treat a configured sibling segment that looks like an id as a record", () => {
    const routes = [{ segment: "admin", label: "Admin", children: [
      { segment: "482", label: "Numeric route" },
    ] }];
    expect(resolveAdminUrlHierarchy("/admin/482", routes)?.recordId).toBeUndefined();
  });

  it("resolves a record-like segment when no configured sibling matches", () => {
    expect(resolveAdminUrlHierarchy("/admin/categories/edebiyat/482", hierarchy)?.recordId).toBe("482");
  });

  it("keeps unrelated top-level routes from being shadowed by the configured tree", () => {
    const otherTree = [{ segment: "admin", label: "Admin", children: [{ segment: "catalog", label: "Catalog" }] }];
    expect(resolveAdminUrlHierarchy("/admin/settings", otherTree)?.crumbs).toEqual([
      { label: "Admin", href: "/admin", current: false },
      { label: "settings", href: "/admin/settings", current: true },
    ]);
    expect(resolveAdminUrlHierarchy("/settings", otherTree)).toBeNull();
  });

  it("returns query and fragment unchanged for deep-link state", () => {
    expect(resolveAdminUrlHierarchy("/admin/categories?sort=name&page=2#results", hierarchy)).toMatchObject({
      search: "?sort=name&page=2",
      hash: "#results",
      pathname: "/admin/categories",
    });
  });
});
