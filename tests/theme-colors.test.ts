// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Theming runs through the admin tokens, and `src/theme/tokens.css` remaps much of the
// palette onto them with `@theme inline`. Two consequences slipped through, because
// Tailwind emits valid CSS either way and nothing else here evaluates color:
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
// surfaces and borders, so they already flip. A fixed dark surface is sometimes what you
// want, and those places carry an `admin-theme-fixed` marker to say so deliberately.
const sourceRoot = join(process.cwd(), "src");

function collectSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectSources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// A literal that never flips, or a background that inverts to near-white in dark mode.
// Variant prefixes are part of the match: `hover:bg-white` and `after:bg-zinc-950` are the
// same defects as the bare utilities, and an earlier version of this check anchored on a
// quote or space and so missed every one of them.
const RISKY = /(?:^|["'`\s])((?:[a-z-]+:)*bg-(?:white|zinc-800|zinc-900|zinc-950|brand-100))\b/g;

// The marker may sit on the line above a class that is wrapped across several lines.
const LOOKBACK = 3;

describe("theme-aware color usage in shipped components", () => {
  it("avoids backgrounds that cannot flip or that invert in dark mode", () => {
    const risky: string[] = [];

    for (const file of collectSources(sourceRoot)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        const context = lines.slice(Math.max(0, index - LOOKBACK), index + 1).join("\n");
        if (context.includes("admin-theme-fixed")) return;
        for (const match of line.matchAll(RISKY)) {
          risky.push(`${file}:${index + 1} ${match[1]}`);
        }
      });
    }

    expect(risky).toEqual([]);
  });

  it("recognises a bare utility, so the variant handling above is not doing the work alone", () => {
    // Guards against the pattern regressing to something that only matches bare utilities.
    expect("bg-white".match(RISKY)).not.toBeNull();
    expect("hover:bg-white".match(RISKY)).not.toBeNull();
    expect("focus-visible:bg-zinc-950".match(RISKY)).not.toBeNull();
    expect("sm:bg-zinc-800".match(RISKY)).not.toBeNull();
    expect("group-hover:bg-zinc-900".match(RISKY)).not.toBeNull();
    expect("hover:bg-brand-100".match(RISKY)).not.toBeNull();
    // The remapped light end of the palette is fine and must not be flagged.
    expect("bg-zinc-50".match(RISKY)).toBeNull();
    expect("bg-zinc-100".match(RISKY)).toBeNull();
    expect("bg-zinc-300".match(RISKY)).toBeNull();
  });
});
