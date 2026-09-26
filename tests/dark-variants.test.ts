// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tailwind silently drops a class it cannot parse, and nothing in the type checker, the
// linter, or the component tests notices, so a class spliced into the wrong place reaches
// production as a missing style. This walks the shipped source and fails on the shapes
// that produce one.
const sourceRoot = join(process.cwd(), "src");

function collectSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectSources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const classAttributes = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g;

describe("dark variant classes", () => {
  it("never splices a dark class into a Tailwind arbitrary-value modifier", () => {
    const malformed: string[] = [];

    for (const file of collectSources(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(classAttributes)) {
        for (const value of [match[1], match[2]].filter(Boolean) as string[]) {
          // A dark class must be a whole token: `dark:border-zinc-800-[width]` is a
          // different, unparseable class rather than `dark:border-zinc-800` plus
          // `transition-[width]`.
          for (const bad of value.matchAll(/dark:[^\s"']*[^\s"'a-zA-Z0-9:/-]/g)) {
            malformed.push(`${file}: ${bad[0]}`);
          }
        }
      }
    }

    expect(malformed).toEqual([]);
  });

  it("keeps every dark class a single whitespace-separated token", () => {
    const malformed: string[] = [];

    for (const file of collectSources(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(classAttributes)) {
        for (const value of [match[1], match[2]].filter(Boolean) as string[]) {
          for (const token of value.split(/\s+/)) {
            if (!token.includes("dark:")) continue;
            // Valid prefixes: dark:, dark:hover:, dark:focus:, and the colour utilities.
            if (!/^dark:(hover:|focus:|active:)*(text|bg|border|ring|divide|placeholder)-/.test(token)) {
              malformed.push(`${file}: ${token}`);
            }
          }
        }
      }
    }

    expect(malformed).toEqual([]);
  });
});
