// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import * as baselineExports from "../src/baseline";
import * as rootExports from "../src/index";
import { componentCatalog, searchCatalog } from "../fixtures/lib/demo-catalog";

/**
 * The catalogue is derived from the entry points, so this file is the check that keeps it that way.
 * The names come from the same module namespaces `readme-exports.test.ts` reads, and the table the
 * catalogue is annotated with is compared against them in both directions: an export with no
 * record fails, and a record with no export fails. Without that, the first component added to the
 * package would be missing from the catalogue with nothing noticing, which is the rot this milestone
 * exists to prevent.
 */
const rootNames = Object.keys(rootExports);
const baselineNames = Object.keys(baselineExports);
const shippedNames = new Set([...rootNames, ...baselineNames]);
const catalogNames = new Set(componentCatalog.map((entry) => entry.name));

describe("the component catalogue", () => {
  it("has an entry for every export the package ships, so a new component is a failure and not a gap", () => {
    const missing = [...shippedNames].filter((name) => !catalogNames.has(name));
    expect(missing, "exported from the package but absent from the catalogue").toEqual([]);
  });

  it("names nothing the package does not export, so a renamed or deleted export is a failure", () => {
    const stale = [...catalogNames].filter((name) => !shippedNames.has(name));
    expect(stale, "in the catalogue but no longer exported").toEqual([]);
  });

  it("holds one entry per export, so a duplicated name cannot hide a missing one", () => {
    expect(componentCatalog.length, "entry count does not match the export count").toBe(
      rootNames.length + baselineNames.length,
    );
  });

  it("never repeats a name, and never leaves one out", () => {
    // The entry list rather than a set of it: a duplicate is an extra element, which a set would
    // have swallowed, and the two entry points could each export a name the other also exports.
    expect(componentCatalog.map((entry) => entry.name).sort()).toEqual([...shippedNames].sort());
  });

  it("describes every export, so the page cannot show a name with nothing under it", () => {
    const undescribed = componentCatalog.filter((entry) => !entry.described).map((entry) => entry.name);
    expect(undescribed, "in the namespace but carrying no description").toEqual([]);
  });

  it("categorises every export, so the filter offers a group for each one", () => {
    const uncategorised = componentCatalog.filter((entry) => entry.category === null).map((e) => e.name);
    expect(uncategorised, "in the namespace but in no category").toEqual([]);
  });

  it("covers a surface worth browsing, rather than an empty page that passes by having nothing in it", () => {
    expect(rootNames.length).toBeGreaterThan(100);
    expect(componentCatalog.length).toBe(rootNames.length + baselineNames.length);
    const categories = new Set(componentCatalog.map((entry) => entry.category));
    expect(categories.size).toBeGreaterThan(8);
  });
});

describe("what a catalogue entry can show a person", () => {
  const components = componentCatalog.filter((entry) => entry.kind === "component");

  it("gives every component either something to look at or a reason it has none", () => {
    const silent = components
      .filter((entry) => (entry.renderable ? entry.hostNote !== null : entry.hostNote === null))
      .map((entry) => entry.name);
    expect(silent, "a component with no preview and no reason").toEqual([]);
  });

  it("explains what the host has to provide for a component that cannot stand on its own", () => {
    const unexplained = components
      .filter((entry) => !entry.renderable)
      .map((entry) => entry.hostNote ?? "");
    for (const note of unexplained) expect(note.length).toBeGreaterThan(20);
  });

  it("shows a derived signature for everything that is not a component", () => {
    const unsigned = componentCatalog
      .filter((entry) => entry.kind !== "component" && entry.signature === null)
      .map((entry) => entry.name);
    expect(unsigned, "not a component and carrying no signature").toEqual([]);
  });

  it("keeps the components it cannot render to a minority, so the page shows most of the package", () => {
    const rendered = components.filter((entry) => entry.renderable).length;
    expect(rendered).toBeGreaterThan(components.length / 2);
    expect(components.length).toBeGreaterThan(50);
  });
});

describe("searching the catalogue", () => {
  it("narrows the list when a query is given, and restores it when the query is cleared", () => {
    const all = componentCatalog.length;
    const matches = searchCatalog(componentCatalog, { query: "modal" });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThan(all);
    expect(searchCatalog(componentCatalog, { query: "" }).length).toBe(all);
  });

  it("matches on a name, ignoring the case a person types it in", () => {
    const matches = searchCatalog(componentCatalog, { query: "adminstatuspill" });
    expect(matches.map((entry) => entry.name)).toContain("AdminStatusPill");
  });

  it("finds an entry by what it does, through the keywords beside it", () => {
    const matches = searchCatalog(componentCatalog, { query: "shimmer" });
    expect(matches.map((entry) => entry.name)).toContain("AdminSkeleton");
  });

  it("takes every word of a multi-word query, so a second word narrows rather than widens", () => {
    const wide = searchCatalog(componentCatalog, { query: "dialog" }).length;
    const narrow = searchCatalog(componentCatalog, { query: "dialog close" });
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(wide);
  });

  it("answers with nothing rather than everything when nothing matches", () => {
    expect(searchCatalog(componentCatalog, { query: "zzzzznothing" })).toEqual([]);
  });

  it("combines a query with a category, so a filter cannot be widened by typing", () => {
    const filtered = searchCatalog(componentCatalog, { query: "admin", category: "Media" });
    expect(filtered.length).toBeGreaterThan(0);
    for (const entry of filtered) expect(entry.category).toBe("Media");
  });
});
