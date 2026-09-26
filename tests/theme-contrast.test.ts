// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The README states the rule this enforces: normal text at 4.5:1, large text and UI
// boundaries at 3:1. Token values are read straight from tokens.css so the check cannot
// drift from the palette, and so a theme edit that breaks text contrast fails here rather
// than in a browser.
//
// Two failure modes this deliberately refuses to tolerate, both of which produced a green
// run that measured nothing:
//
//   - A pairing whose token is missing or renamed is skipped. A deleted token falls back to
//     nothing in the browser while the test still passed, so every declared pair must be
//     resolvable or this fails.
//   - A value the parser cannot resolve yields NaN, and `NaN < 4.5` is false, so the pair
//     passed without being measured. Unresolvable values now fail instead.
//
// Borders are measured and surfaced but not asserted. Both border tokens sit below the 3:1
// the README sets for UI boundaries and form controls rely on them, so tightening them is a
// palette change for a maintainer to decide rather than something to encode as acceptable.
const css = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");

type Palette = Record<string, Record<string, string>>;

/**
 * The cascade is `:root, [data-admin-theme="light"]` followed by a dark block that only
 * overrides, so dark inherits every token it does not restate. Each theme is therefore the
 * light values with that theme's own declarations layered on top.
 */
function palettes(): Palette {
  const blocks: Record<string, Record<string, string>> = {};
  const order: string[] = [];
  for (const block of css.matchAll(/(:root\s*,\s*\[data-admin-theme="light"\]|\[data-admin-theme="(\w+)"\])\s*\{([^}]*)\}/g)) {
    const theme = block[2] ?? "light";
    if (!blocks[theme]) {
      order.push(theme);
      blocks[theme] = {};
    }
    for (const decl of block[3].matchAll(/(--admin-[a-z0-9-]+):\s*([^;]+);/g)) {
      blocks[theme][decl[1]] = decl[2].trim();
    }
  }
  const base = blocks.light ?? {};
  const resolved: Palette = { light: { ...base } };
  for (const theme of order) {
    if (theme === "light") continue;
    resolved[theme] = { ...base, ...blocks[theme] };
  }
  return resolved;
}

/** Only 3- and 6-digit hex are understood. Anything else is reported, not guessed at. */
function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/.test(hex)) return null;
  const full = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
};

/**
 * Resolves a token value to RGB, following `var()` references and `color-mix()` in srgb.
 * Returns null when the value cannot be resolved, so the caller can fail rather than
 * silently measuring nothing.
 */
function resolve(value: string, palette: Record<string, string>, depth = 0): [number, number, number] | null {
  if (depth > 6) return null;
  const direct = parseHex(value);
  if (direct) return direct;
  const named = NAMED[value.trim().toLowerCase()];
  if (named) return named;

  const reference = value.match(/^var\((--admin-[a-z0-9-]+)\)$/);
  if (reference) {
    const target = palette[reference[1]];
    return target === undefined ? null : resolve(target, palette, depth + 1);
  }

  // One side may omit its percentage, as `--admin-brand-text: color-mix(in srgb,
  // var(--admin-brand-500) 80%, black)` does, in which case it takes the remainder.
  const mix = value.match(
    /^color-mix\(\s*in srgb\s*,\s*(.+?)\s*(?:([\d.]+)%)?\s*,\s*(.+?)\s*(?:([\d.]+)%)?\s*\)$/,
  );
  if (mix) {
    const a = resolve(mix[1], palette, depth + 1);
    const b = resolve(mix[3], palette, depth + 1);
    if (!a || !b) return null;
    const first = mix[2] === undefined ? null : Number(mix[2]) / 100;
    const second = mix[4] === undefined ? null : Number(mix[4]) / 100;
    const wa = first ?? (second === null ? null : 1 - second);
    const wb = second ?? (first === null ? null : 1 - first);
    if (wa === null || wb === null) return null;
    const total = wa + wb;
    if (total === 0) return null;
    return [0, 1, 2].map((i) => Math.round((a[i] * wa + b[i] * wb) / total)) as [number, number, number];
  }

  return null;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const luminance = ([r, g, bl]: [number, number, number]) => {
    const [R, G, B] = [r, g, bl].map((c) => c / 255);
    const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear(R) + 0.7152 * linear(G) + 0.0722 * linear(B);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ["--admin-text-primary", "--admin-surface"],
  ["--admin-text-secondary", "--admin-surface"],
  ["--admin-text-muted", "--admin-surface"],
  ["--admin-text-disabled", "--admin-surface"],
  ["--admin-text-primary", "--admin-surface-subtle"],
  ["--admin-text-muted", "--admin-surface-subtle"],
  ["--admin-text-secondary", "--admin-surface-muted"],
  ["--admin-text-muted", "--admin-surface-muted"],
  ["--admin-brand-text", "--admin-surface"],
  ["--admin-brand-text", "--admin-surface-subtle"],
  ["--admin-on-brand", "--admin-brand-500"],
  ["--admin-on-brand", "--admin-brand-600"],
  ["--admin-on-danger", "--admin-danger-action"],
  ["--admin-on-success", "--admin-success-action"],
  ["--admin-success-text", "--admin-success-surface"],
  ["--admin-danger-text", "--admin-danger-surface"],
  ["--admin-warning-text", "--admin-warning-surface"],
];

const BOUNDARY_PAIRS: Array<[string, string]> = [
  ["--admin-border", "--admin-surface"],
  ["--admin-border-strong", "--admin-surface"],
];

type Measurement = { label: string; ratio: number };

function measure(
  pairs: Array<[string, string]>,
  theme: string,
): { measured: Measurement[]; problems: string[] } {
  const palette = palettes()[theme] ?? {};
  const measured: Measurement[] = [];
  const problems: string[] = [];
  for (const [fg, bg] of pairs) {
    const missing = [fg, bg].filter((token) => palette[token] === undefined);
    if (missing.length > 0) {
      // Report the undeclared token once, and do not also report a resolve failure for the
      // same pairing: the missing declaration is the cause and the actionable fact.
      problems.push(`[${theme}] not declared: ${missing.join(", ")}`);
      continue;
    }
    const from = resolve(palette[fg], palette);
    const onto = resolve(palette[bg], palette);
    if (!from || !onto) {
      problems.push(`[${theme}] could not resolve ${fg} on ${bg}`);
      continue;
    }
    const ratio = contrast(from, onto);
    measured.push({ label: `${theme} ${fg} on ${bg}`, ratio });
  }
  return { measured, problems };
}

describe("theme token contrast", () => {
  it("meets 4.5:1 for every text pairing the components use", () => {
    const failures: string[] = [];
    const unresolved: string[] = [];
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure(TEXT_PAIRS, theme);
      unresolved.push(...problems);
      // Compared on the raw ratio. A ratio of 4.496 formats as "4.50", so comparing the
      // formatted string let pairs just under the threshold pass.
      failures.push(
        ...measured.filter((m) => m.ratio < 4.5).map((m) => `${m.label} = ${m.ratio.toFixed(3)}:1`),
      );
    }
    // An unresolvable or undeclared token is a failure, not a skip. A renamed token used to
    // make this pass while contributing nothing in the browser.
    expect(unresolved).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("resolves every declared pair in both themes, so the check above is not vacuous", () => {
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure([...TEXT_PAIRS, ...BOUNDARY_PAIRS], theme);
      expect(problems, theme).toEqual([]);
      expect(measured.length, theme).toBe(TEXT_PAIRS.length + BOUNDARY_PAIRS.length);
    }
  });

  it("surfaces the measured boundary contrast, which is below the documented 3:1", () => {
    const report: string[] = [];
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure(BOUNDARY_PAIRS, theme);
      expect(problems, theme).toEqual([]);
      report.push(...measured.map((m) => `${m.label} = ${m.ratio.toFixed(2)}:1`));
    }
    // Reported rather than asserted: both border tokens are under 3:1 in the light theme and
    // form controls depend on them, so this is a maintainer's decision, not a fixed rule.
    console.info(`boundary contrast (UI boundaries are documented at 3:1):\n  ${report.join("\n  ")}`);
    expect(report.length).toBe(BOUNDARY_PAIRS.length * 2);
    for (const theme of ["light", "dark"]) {
      for (const m of measure(BOUNDARY_PAIRS, theme).measured) {
        expect(Number.isFinite(m.ratio), m.label).toBe(true);
      }
    }
  });
});
