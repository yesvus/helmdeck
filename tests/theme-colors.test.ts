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
//      mode. Used as a background under light content, it renders white-on-white. This is
//      what made the tooltip popup invisible.
//
// The inverse is fine and deliberately not flagged: `zinc-50` through `zinc-300` map to
// surfaces and borders, so they already flip. A fixed dark surface is sometimes what you
// want, and those lines carry an `admin-theme-fixed` marker to say so deliberately.
const sourceRoot = join(process.cwd(), "src");

function collectSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectSources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

// A literal that never flips, or a background that inverts to near-white in dark mode.
const RISKY = /(?:^|["'\s])((?:bg)-(?:white|zinc-800|zinc-900|zinc-950))\b/g;

describe("theme-aware color usage in shipped components", () => {
  it("avoids backgrounds that cannot flip or that invert in dark mode", () => {
    const risky: string[] = [];

    for (const file of collectSources(sourceRoot)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes("admin-theme-fixed")) return;
          for (const match of line.matchAll(RISKY)) {
            risky.push(`${file}:${index + 1} ${match[1]}`);
          }
        });
    }

    expect(risky).toEqual([]);
  });
});
