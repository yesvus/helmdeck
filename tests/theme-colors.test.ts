// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Theming runs through the admin tokens, and `src/theme/tokens.css` remaps much of the
// palette onto them with `@theme inline`. Several mistakes slipped through that way,
// because Tailwind emits valid CSS either way and nothing else here evaluates color:
//
//   1. `bg-white` is a literal. It does not resolve to a token, so it stays white in dark
//      mode. This is what left the fixture landing page light.
//   2. `bg-zinc-800` and darker map to `--admin-text-primary`, which is #fafaf9 in dark
//      mode. Used as a background under light content it renders white-on-white. This is
//      what made the tooltip popup invisible.
//   3. `bg-brand-100` maps to `--admin-brand-100`, which is declared once in the light
//      block and never overridden, so it stays #fef3c7 in dark mode. Under theme-aware
//      text that inverts, which is what `hover:bg-brand-100` on a search result did.
//
// The inverse is fine and deliberately not flagged: `zinc-50` through `zinc-300` map to
// surfaces and borders, so they already flip.
//
// A subtree that must not theme at all, such as a static illustration of a light-mode
// screen, is wrapped in `admin-theme-fixed:start` and `admin-theme-fixed:end`. A single
// line can carry a bare `admin-theme-fixed` marker instead.
//
// Scope is `src/`, which is published to consumers, and `fixtures/`, which is the demo
// people actually look at. Both have carried these defects. An earlier version scanned
// `src/` only, and every one of the landing page's problems was therefore invisible to it
// while still being real to anyone running the demo.
const sourceRoots = [join(process.cwd(), "src"), join(process.cwd(), "fixtures")];

function collectSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectSources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// A literal that never flips, or a background that inverts in dark mode. Variant prefixes
// are part of the match, including breakpoint prefixes such as `2xl:`, because
// `hover:bg-white` and `2xl:bg-white` are the same defect as the bare utility.
const RISKY = /(?:^|["'`\s])((?:[a-z0-9-]+:)*bg-(?:white|zinc-800|zinc-900|zinc-950|brand-100))\b/g;

// Which palette utilities actually theme is read from tokens.css rather than listed here.
// Hardcoding the list is how `amber-400` and `emerald-400` became false positives: they sit
// in a remapped prefix but are not themselves remapped, so they stay literal.
function remappedUtilities(): Set<string> {
  const css = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
  const remapped = new Set<string>();
  // The token name may itself end in a shade, as --admin-brand-100 does, so digits belong
  // in the character class. Leaving them out made brand-100 read as unremapped, which is the
  // token that inverted the landing page badge.
  // The colour name is captured whole, not as `<palette>-<shade>`. The admin-* utilities
  // have no shade, so a shade-shaped pattern left bg-admin-surface and
  // border-admin-border invisible to the fixed-region check below.
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*var\(--admin-[a-z0-9-]+\)/g)) {
    remapped.add(match[1]);
  }
  return remapped;
}

// A region marked as fixed must not contain any remapped utility, because one is enough to
// make the region theme after all.
const REMAPPED_SHADES = remappedUtilities();
const UTILITY_SHAPE = /(?:^|["'`\s])((?:[a-z0-9-]+:)*(?:bg|text|border|from|via|to|ring|fill|stroke|divide|outline|decoration)-([a-z0-9-]+))\b/g;

const START = "admin-theme-fixed:start";
const END = "admin-theme-fixed:end";
const LINE_MARKER = "admin-theme-fixed";
// A bare marker documents a class that is wrapped across a ternary, so it covers the
// lines around it rather than only the line it sits on. It only exempts a line that has a
// single risky background: a marker must not launder an unrelated class that happens to
// share the line, which is why the count is checked rather than the line skipped outright.
const LOOKBACK = 3;

function riskyIn(file: string): string[] {
  const risky: string[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  let inFixedRegion = false;
  lines.forEach((line, index) => {
    if (line.includes(START)) inFixedRegion = true;
    if (line.includes(END)) inFixedRegion = false;
    if (inFixedRegion) {
      // A fixed region is only fixed if nothing in it can theme, so this is checked rather
      // than trusted. Marking a region and then leaving one remapped utility inside it is
      // how the landing page's mockup window ended up half-themed.
      for (const match of line.matchAll(UTILITY_SHAPE)) {
        if (REMAPPED_SHADES.has(match[2])) {
          risky.push(`${file}:${index + 1} ${match[1]} themes but sits in a fixed region`);
        }
      }
      return;
    }
    const matches = [...line.matchAll(RISKY)];
    if (matches.length === 0) return;
    const context = lines.slice(Math.max(0, index - LOOKBACK), index + 1).join("\n");
    if (matches.length === 1 && context.includes(LINE_MARKER)) return;
    for (const match of matches) {
      risky.push(`${file}:${index + 1} ${match[1]}`);
    }
  });
  return risky;
}

describe("theme-aware color usage in shipped components", () => {
  it("avoids backgrounds that cannot flip or that invert in dark mode", () => {
    const risky = sourceRoots.flatMap(collectSources).flatMap(riskyIn);
    expect(risky).toEqual([]);
  });

  it("derives the remapped palette from tokens.css, including the partial prefixes", () => {
    // Guarding against the two ways this has been wrong: listing the shades by hand, which
    // produced false positives for amber-400, and assuming a prefix is wholly remapped,
    // which is false for emerald and amber, where only some shades are mapped.
    expect(REMAPPED_SHADES.has("zinc-900")).toBe(true);
    expect(REMAPPED_SHADES.has("brand-100")).toBe(true);
    expect(REMAPPED_SHADES.has("emerald-400")).toBe(true);
    expect(REMAPPED_SHADES.has("amber-400")).toBe(false);
    expect(REMAPPED_SHADES.has("rose-400")).toBe(false);
    expect(REMAPPED_SHADES.has("slate-500")).toBe(false);
    // The admin-* utilities carry no shade and were previously missed entirely.
    expect(REMAPPED_SHADES.has("admin-surface")).toBe(true);
    expect(REMAPPED_SHADES.has("admin-border")).toBe(true);
    expect(REMAPPED_SHADES.has("admin-brand-text")).toBe(true);
    expect(REMAPPED_SHADES.has("admin-nope")).toBe(false);
  });

  it("matches bare utilities and every variant form, so the coverage above is real", () => {
    for (const token of [
      "bg-white",
      "hover:bg-white",
      "focus-visible:bg-zinc-950",
      "sm:bg-zinc-800",
      "group-hover:bg-zinc-900",
      "2xl:bg-white",
      "hover:bg-brand-100",
      "dark:hover:bg-zinc-900",
    ]) {
      expect(`${token} `.match(RISKY), token).not.toBeNull();
    }
    // The remapped light end of the palette is fine and must not be flagged.
    for (const token of ["bg-zinc-50", "bg-zinc-100", "bg-zinc-300", "bg-admin-surface"]) {
      expect(`${token} `.match(RISKY), token).toBeNull();
    }
  });
});
