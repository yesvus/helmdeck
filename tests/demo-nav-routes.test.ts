// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sampleNav, sampleSearchEntries } from "../fixtures/nav";

/**
 * Every entry the sidebar offers is a page that exists.
 *
 * The failure this prevents is not hypothetical and it has happened five times in this repository:
 * a workstream built a route, reported the path, and the route was reachable only by typing its URL.
 * The engine dashboard had the same problem and is why the engine dashboard entry carries a comment
 * about it. A sidebar is a list of claims, and a claim that cannot be followed is worse than a
 * missing feature, because it looks like the feature is there.
 *
 * The route is resolved to a file rather than a framework's own routing table, so this holds without
 * a build and without a running server.
 */
// The demo's routes live in the `(helmdeck)` route group, beside Payload's own group. A route group is
// invisible in a URL, so hrefs are unchanged and only the directory a route resolves to has moved.
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/app/(helmdeck)");

/** Where a href lands: `app/<href>/page.tsx`, or `app/page.tsx` at the root. */
function pageFileFor(href: string): string {
  return join(appRoot, href.replace(/^\//, ""), "page.tsx");
}

function everyEntry(): { href: string; label: string }[] {
  return [
    ...sampleNav.flatMap((group) => group.items.map((item) => ({ href: item.href, label: item.label }))),
    ...sampleSearchEntries.map((entry) => ({ href: entry.href, label: entry.label })),
  ];
}

describe("the demo's own sidebar", () => {
  it("offers only routes that exist", () => {
    const missing = everyEntry()
      .filter((entry) => !existsSync(pageFileFor(entry.href)))
      .map((entry) => `${entry.label} -> ${entry.href}`);
    expect(missing, "a sidebar entry with no page behind it").toEqual([]);
  });

  it("carries the CMS surfaces, which were each reachable only by a typed URL", () => {
    // Spelled out rather than derived from the list above, so deleting an entry fails here even if
    // every href still resolves. A guard that checks only that links work cannot notice a feature
    // that has quietly stopped being offered.
    const hrefs = everyEntry().map((entry) => entry.href);
    expect(hrefs).toContain("/shell/content");
    expect(hrefs).toContain("/shell/revisions");
    expect(hrefs).toContain("/shell/schedule");
    expect(hrefs).toContain("/catalog");
    expect(hrefs).toContain("/dashboard/arrange");
  });

  it("names an icon the package accepts, so a sidebar never renders a blank", () => {
    // The icon vocabulary is a closed union in the package. An unknown name is a type error today,
    // and this is here so the failure names the entry rather than the file it was written in.
    const named = everyEntry();
    expect(named.length).toBeGreaterThan(0);
    for (const group of sampleNav) {
      for (const item of group.items) {
        expect(item.icon, `${item.label} has no icon`).toBeTruthy();
      }
    }
  });
});
