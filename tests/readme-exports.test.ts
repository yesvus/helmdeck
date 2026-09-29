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
const rootNames = new Set(Object.keys(rootExports));
const baselineNames = new Set(Object.keys(baselineExports));

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

/**
 * The baseline adapters live behind the `@yesvus/helmdeck/baseline` subpath, not the root.
 * Checking them against the union of both namespaces would pass a reader who followed the
 * README's main import and got a module with no such export.
 */
const DOCUMENTED_BASELINE = [
  "createSessionAuthAdapter",
  "createCredentialAuthAdapter",
  "createPersistenceCredentialStore",
  "createMemoryPersistenceAdapter",
  "createSqlitePersistenceAdapter",
  "createAuditAdapter",
  "createCacheAdapter",
  "generateSessionSecret",
  "hashPassword",
  "normalizeEmail",
  "verifyPassword",
  "CREDENTIAL_USERS_SCHEMA",
  "CREDENTIAL_SESSIONS_SCHEMA",
];

const DOCUMENTED_FUNCTIONS = [
  "useAdminSession",
  "useAdminPermission",
  "useAdminCan",
  "useAdminPermittedNav",
  "adminReturnTo",
  "defineAdminResource",
  "adminResourceValues",
];

const ALL = [...DOCUMENTED_COMPONENTS, ...DOCUMENTED_FUNCTIONS, ...DOCUMENTED_BASELINE];

describe("the getting-started documentation matches the package", () => {
  it("exports every API the documentation names from the entry point it documents", () => {
    const fromRoot = [...DOCUMENTED_COMPONENTS, ...DOCUMENTED_FUNCTIONS].filter(
      (name) => !rootNames.has(name),
    );
    const fromBaseline = DOCUMENTED_BASELINE.filter((name) => !baselineNames.has(name));
    expect({ fromRoot, fromBaseline }, "documented but not exported from that entry point").toEqual({
      fromRoot: [],
      fromBaseline: [],
    });
  });

  it("does not also offer the baseline adapters from the root entry point", () => {
    // Otherwise a reader would have no reason to know the subpath exists.
    const leaked = DOCUMENTED_BASELINE.filter((name) => rootNames.has(name));
    expect(leaked, "reachable from the root, so the documented subpath is optional").toEqual([]);
  });

  it("mentions every API it claims to document, so neither list can rot", () => {
    // Word boundaries, not `includes`: renaming a documented `AdminCan` to `AdminCanTypo`
    // leaves the old name present as a substring, which would pass a plain check.
    const unmentioned = ALL.filter((name) => !new RegExp(`\\b${name}\\b`).test(README));
    expect(unmentioned, "listed here but no longer in the README").toEqual([]);
  });

  it("checks a meaningful number of names, and does not check an empty list", () => {
    // An empty DOCUMENTED_BASELINE made both subpath assertions vacuously true, which is
    // exactly the shape of failure this file exists to catch.
    expect(DOCUMENTED_BASELINE.length).toBeGreaterThan(0);
    expect(DOCUMENTED_FUNCTIONS.length).toBeGreaterThan(0);
    expect(ALL.length).toBeGreaterThan(15);
    // And the lists are not simply a copy of the exports, which would make the rest vacuous.
    expect(ALL.length).toBeLessThan(rootNames.size + baselineNames.size);
  });
});

/**
 * The install block has to be the configuration that actually works.
 *
 * Helmdeck's components are written with Tailwind utilities, which Tailwind only generates for source
 * it scans, so a host that omits `@source` gets the design tokens and no layout at all. The
 * independent host is the thing that is known to work, so the README is checked against it rather
 * than against a line written out a second time and left to drift.
 */
describe("the documented install block", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("points Tailwind at the installed package, as the independent host does", () => {
    const documented = README.match(/@source\s+"([^"]+)"/)?.[1];
    const working = read("examples/independent-host/app/globals.css").match(/@source\s+"([^"]+)"/)?.[1];

    // Without this a host following the documentation gets tokens and no layout, and the demo and the
    // example both keep working, so nothing else would notice.
    expect(documented).toBeTruthy();
    expect(documented).toBe(working);
  });

  it("imports the theme stylesheet, so the tokens arrive with the layout", () => {
    expect(README).toContain('@import "@yesvus/helmdeck/theme.css";');
  });
});
