// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { adminInputClassName } from "../src/primitives/input.js";
import { buttonVariants } from "../src/primitives/button.js";
import {
  ADMIN_DENSITIES,
  ADMIN_DENSITY_SCALE,
  DEFAULT_ADMIN_DENSITY,
  isAdminDensity,
} from "../src/theme/density.js";

/**
 * Density is only a feature if it reaches the page. `--admin-density` was declared in
 * `tokens.css` and read by nothing, so a host could set it and watch nothing change. These
 * checks compile the shipped stylesheet with the installed Tailwind and read the CSS that
 * comes out, because the claim is about the output of the build rather than about a string
 * written in a file.
 */
const TOKENS = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
const TAILWIND_ENTRY = join(process.cwd(), "node_modules/tailwindcss/index.css");

/** Compiles the two stylesheets a host imports, in the order the README documents. */
async function emittedCss(classNames: string[]): Promise<string> {
  const compiler = await compile(`@import "tailwindcss";\n${TOKENS}`, {
    base: `${process.cwd()}/`,
    async loadStylesheet(id, basePath) {
      if (id !== "tailwindcss") throw new Error(`unexpected stylesheet: ${id}`);
      return { base: basePath, path: TAILWIND_ENTRY, content: readFileSync(TAILWIND_ENTRY, "utf8") };
    },
  });
  return compiler.build(classNames);
}

/** The declarations Tailwind emitted for one utility, or "" when it emitted no rule for it. */
function declarations(css: string, utility: string): string {
  return new RegExp(`\\.${utility} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe("density as a library setting", () => {
  it("offers the three documented steps and defaults to the value the token already had", () => {
    expect([...ADMIN_DENSITIES]).toEqual(["compact", "comfortable", "spacious"]);
    expect(DEFAULT_ADMIN_DENSITY).toBe("comfortable");
    // 1 is what `--admin-density` said before density was a setting, so a host that changes
    // nothing renders what it rendered before.
    expect(ADMIN_DENSITY_SCALE.comfortable).toBe("1");
    expect(TOKENS).toContain("--admin-density: 1;");
    expect(isAdminDensity("compact")).toBe(true);
    expect(isAdminDensity("cosy")).toBe(false);
    expect(isAdminDensity(1)).toBe(false);
  });

  it("scales the shipped spacing utilities by the density variable, not by a fixed length", async () => {
    const css = await emittedCss(["p-4", "gap-2", "h-9", "mt-6", "px-3"]);

    expect(css).toContain("--spacing: calc(0.25rem * var(--admin-density))");
    // Each of these has to stay a multiple of the spacing variable. A rule that resolved to a
    // fixed length would render the same at every density, which is the defect the token-only
    // version had.
    for (const [utility, declaration] of [
      ["p-4", "padding: calc(var(--spacing) * 4)"],
      ["gap-2", "gap: calc(var(--spacing) * 2)"],
      ["h-9", "height: calc(var(--spacing) * 9)"],
      ["mt-6", "margin-top: calc(var(--spacing) * 6)"],
      ["px-3", "padding-inline: calc(var(--spacing) * 3)"],
    ] as const) {
      expect(declarations(css, utility), utility).toContain(declaration);
    }
  });

  it("scales the controls the primitives render, not just a utility in isolation", async () => {
    const button = buttonVariants({ size: "default" }).split(/\s+/);
    const css = await emittedCss([...new Set([...button, ...adminInputClassName.split(/\s+/)])]);

    // The default button is `h-9` and the input is `h-11`, both fixed heights in the class
    // lists above. They have to stay multiples of the spacing variable or a host's density
    // setting would leave every control at its original size.
    expect(declarations(css, "h-9")).toContain("height: calc(var(--spacing) * 9)");
    expect(declarations(css, "h-11")).toContain("height: calc(var(--spacing) * 11)");
    expect(declarations(css, "px-3")).toContain("padding-inline: calc(var(--spacing) * 3)");
  });

  it("leaves type, width and radius out of the density scale", async () => {
    const css = await emittedCss(["text-sm", "max-w-5xl", "rounded-lg", "w-4"]);

    // A denser admin is a tighter admin, not a smaller or narrower one. Widths and radii keep
    // their own tokens, and `w-4` scales with spacing as any other spacing utility does.
    expect(declarations(css, "max-w-5xl")).toContain("max-width: var(--container-5xl)");
    expect(declarations(css, "text-sm")).toContain("font-size: var(--text-sm)");
    expect(declarations(css, "rounded-lg")).toContain("border-radius: var(--radius-lg)");
  });
});
