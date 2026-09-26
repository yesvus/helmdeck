// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { adminReturnTo } from "../src/shell/auth";

function next(value: string) {
  return adminReturnTo(new URLSearchParams(`next=${encodeURIComponent(value)}`));
}

describe("adminReturnTo", () => {
  it("reads back the destination a guard recorded", () => {
    expect(next("/admin/products")).toBe("/admin/products");
  });

  it("preserves a query string on the destination", () => {
    expect(next("/admin/products?page=2&sort=name")).toBe("/admin/products?page=2&sort=name");
  });

  it("keeps a nested path rather than truncating it at the first segment", () => {
    expect(next("/admin/products/42/edit")).toBe("/admin/products/42/edit");
  });

  it("is empty when the login page was reached directly", () => {
    expect(adminReturnTo(new URLSearchParams())).toBeNull();
    expect(adminReturnTo(null)).toBeNull();
    expect(adminReturnTo(undefined)).toBeNull();
    expect(adminReturnTo(new URLSearchParams("next="))).toBeNull();
  });

  // Each of these is an open redirect. The value arrives from the query string and decides
  // where a freshly authenticated visitor lands, so every one of them has to be refused
  // rather than normalised into something navigable.
  it.each([
    ["another origin", "https://evil.example/steal"],
    ["a protocol-relative host", "//evil.example/steal"],
    ["a backslash host", "/\\evil.example/steal"],
    ["an encoded protocol-relative host", "/%2F%2Fevil.example"],
    ["a backslash after the first segment", "/admin/\\evil.example"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["a relative path with no leading slash", "admin/products"],
    ["a bare host", "evil.example"],
  ])("refuses %s", (_label, value) => {
    expect(next(value)).toBeNull();
  });

  it("refuses a value that only looks root-relative once decoded", () => {
    // Harmless through router.push, which does not decode before resolving, but a host that
    // decodes the value itself would hand the visitor to the other origin. The helper is
    // public, so it cannot assume what a host does with the string.
    expect(next("/%2F%2Fevil.example")).toBeNull();
    expect(next("/%5C%5Cevil.example")).toBeNull();
  });

  it("refuses a value that needs more than three decodings to settle", () => {
    // Unbounded peeling would be a denial-of-service vector in a query string, so the walk is
    // capped and anything still changing is refused.
    expect(next("/%2525252545252545admin")).toBeNull();
  });

  it("refuses a value with a malformed percent escape", () => {
    expect(next("/admin/%")).toBeNull();
    expect(next("/admin/%zz")).toBeNull();
  });

  it("still accepts an ordinary path that happens to contain a percent escape", () => {
    // %20 is a space, so this decodes to "/admin/a b" and then settles. A blanket ban on "%"
    // would break legitimate encoded paths.
    expect(next("/admin/a%20b")).toBe("/admin/a b");
  });
});
