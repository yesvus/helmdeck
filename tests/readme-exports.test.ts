// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as rootExports from "../src/index";
import * as baselineExports from "../src/baseline";

/**
 * The README is the documented contract, so a name it tells people to import has to exist,
 * and an API the documentation leans on should not quietly stop being mentioned. Both
 * directions are checked here.
 *
 * The lists are explicit rather than scraped from the prose. Scraping cannot tell a component
 * from a prop, and cannot tell a runtime export from a type-only one, since a type does not
 * appear in a module namespace at all. Both mistakes produce failures that are not real, and a
 * guard that cries wolf gets ignored.
 */
const README = readFileSync(join(process.cwd(), "README.md"), "utf8");
const exported = new Set([...Object.keys(rootExports), ...Object.keys(baselineExports)]);

const DOCUMENTED_COMPONENTS = [
  "AdminAuthProvider",
  "AdminRequireSession",
  "AdminCan",
  "AdminPermissionsProvider",
  "AdminProfilePage",
  "AdminSettingsPage",
  "AdminResourceList",
  "AdminResourceForm",
  "AdminShell",
];

const DOCUMENTED_FUNCTIONS = [
  "useAdminSession",
  "useAdminPermission",
  "useAdminCan",
  "useAdminPermittedNav",
  "adminReturnTo",
  "defineAdminResource",
  "adminResourceValues",
  "createSessionAuthAdapter",
  "createMemoryPersistenceAdapter",
  "createAuditAdapter",
  "createCacheAdapter",
];

const ALL = [...DOCUMENTED_COMPONENTS, ...DOCUMENTED_FUNCTIONS];

describe("the getting-started documentation matches the package", () => {
  it("exports every API the documentation names", () => {
    const missing = ALL.filter((name) => !exported.has(name));
    expect(missing, "documented but not exported").toEqual([]);
  });

  it("mentions every API it claims to document, so neither list can rot", () => {
    // Word boundaries, not `includes`: renaming a documented `AdminCan` to `AdminCanTypo`
    // leaves the old name present as a substring, which would pass a plain check.
    const unmentioned = ALL.filter((name) => !new RegExp(`\\b${name}\\b`).test(README));
    expect(unmentioned, "listed here but no longer in the README").toEqual([]);
  });

  it("checks a meaningful number of names", () => {
    expect(ALL.length).toBeGreaterThan(15);
    // And the lists are not a copy of the exports, which would make the first test vacuous.
    expect(ALL.length).toBeLessThan(exported.size);
  });
});
