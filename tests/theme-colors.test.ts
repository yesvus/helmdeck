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
// Scope is `src/` only, which is the code published to consumers. The fixture app under
// `fixtures/` is demo code that ships to nobody, and it is not covered: the landing page
// carried several of these defects and they were found by reading, not by this check.
const sourceRoot = join(process.cwd(), "src");

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

const START = "admin-theme-fixed:start";
const END = "admin-theme-fixed:end";
const LINE_MARKER = "admin-theme-fixed";
// A bare marker documents a class that is wrapped across a ternary, so it covers the
// lines around it rather than only the line it sits on.
const LOOKBACK = 3;

function riskyIn(file: string): string[] {
  const risky: string[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  let inFixedRegion = false;
  lines.forEach((line, index) => {
    if (line.includes(START)) inFixedRegion = true;
    if (line.includes(END)) inFixedRegion = false;
    if (inFixedRegion) return;
    const context = lines.slice(Math.max(0, index - LOOKBACK), index + 1).join("\n");
    if (context.includes(LINE_MARKER)) return;
    for (const match of line.matchAll(RISKY)) {
      risky.push(`${file}:${index + 1} ${match[1]}`);
    }
  });
  return risky;
}

describe("theme-aware color usage in shipped components", () => {
  it("avoids backgrounds that cannot flip or that invert in dark mode, in src/", () => {
    const risky = collectSources(sourceRoot).flatMap(riskyIn);
    expect(risky).toEqual([]);
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
