// SPDX-License-Identifier: MIT
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
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
// Borders split by role. --admin-border-strong is asserted at 3:1 because every control
// boundary resolves to it, and its ratio is measured from the palette. --admin-border is
// decorative, so its ratio is recorded rather than asserted; darkening it enough to clear
// 3:1 would make the two tokens indistinguishable and flatten the border hierarchy.
//
// Measuring a token proves nothing about whether a control is actually wired to it, so the
// second half of this file reads the components and fails when an interactive element draws
// its boundary from the decorative token. Both halves failed as a pair before: the palette
// was asserted at 3:1 while seven controls still sat on the token at 1.26:1.
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
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
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

// WCAG 1.4.11 asks for 3:1 on the boundaries of controls, since those identify an
// interactive component. Every control border resolves to --admin-border-strong, so that is
// the pair held to 3:1. --admin-border is for decorative separators, which identify nothing
// and are measured but not asserted, because darkening them would flatten the border
// hierarchy without improving accessibility.
const CONTROL_BOUNDARY_PAIRS: Array<[string, string]> = [["--admin-border-strong", "--admin-surface"]];

const DECORATIVE_BOUNDARY_PAIRS: Array<[string, string]> = [["--admin-border", "--admin-surface"]];

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

  it("meets 3:1 for the boundary that identifies a control", () => {
    const failures: string[] = [];
    const unresolved: string[] = [];
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure(CONTROL_BOUNDARY_PAIRS, theme);
      unresolved.push(...problems);
      // Raw ratio, not the formatted label: 2.996 must not round up and pass.
      failures.push(...measured.filter((m) => m.ratio < 3).map((m) => `${m.label} = ${m.ratio.toFixed(3)}:1`));
    }
    expect(unresolved).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("reports the decorative separator contrast, which is below 3:1 by design", () => {
    const report: string[] = [];
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure(DECORATIVE_BOUNDARY_PAIRS, theme);
      expect(problems, theme).toEqual([]);
      report.push(...measured.map((m) => `${m.label} = ${m.ratio.toFixed(2)}:1`));
    }
    // Recorded rather than asserted. This token draws card edges and section rules, which
    // identify no control, so WCAG 1.4.11 does not apply and darkening it to 3:1 would
    // flatten the border hierarchy for no accessibility gain.
    console.info(`decorative separator contrast (no 3:1 requirement):\n  ${report.join("\n  ")}`);
    expect(report.length).toBe(DECORATIVE_BOUNDARY_PAIRS.length * 2);
  });

  it("resolves every declared pair in both themes, so the checks above are not vacuous", () => {
    for (const theme of ["light", "dark"]) {
      const { measured, problems } = measure(
        [...TEXT_PAIRS, ...CONTROL_BOUNDARY_PAIRS, ...DECORATIVE_BOUNDARY_PAIRS],
        theme,
      );
      expect(problems, theme).toEqual([]);
      expect(measured.length, theme).toBe(
        TEXT_PAIRS.length + CONTROL_BOUNDARY_PAIRS.length + DECORATIVE_BOUNDARY_PAIRS.length,
      );
    }
  });
});

// Interactive elements, and our own components whose className is forwarded onto one. A border
// class on any of these is the control's own boundary, so it has to be the strong token.
const CONTROL_TAGS = new Set([
  "button",
  "input",
  "textarea",
  "select",
  "summary",
  "Button",
  "AdminInput",
  "AdminTextarea",
  "AdminSelect",
  "DialogPrimitive.Content",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Raw text of a className/class attribute, so string and cn() forms are both covered. */
function classAttrText(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  const attrs = el.attributes.properties.filter(ts.isJsxAttribute);
  const attr = attrs.find((a) => ts.isIdentifier(a.name) && (a.name.text === "className" || a.name.text === "class"));
  if (!attr || !attr.initializer) return "";
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  return attr.initializer.getText();
}

describe("control boundaries are wired to the token that clears 3:1", () => {
  const files = sourceFiles(join(process.cwd(), "src"));

  it("scans the component tree rather than an empty or moved directory", () => {
    // If src ever moved, every check below would match nothing and pass vacuously.
    expect(files.length).toBeGreaterThan(10);
  });

  it("keeps every interactive element off the decorative border token", () => {
    const offenders: string[] = [];
    let inspected = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const name = file.slice(process.cwd().length + 1);
      const visit = (node: ts.Node): void => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
          // At runtime JsxElement carries the tag on openingElement, not on itself.
          const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
          const tag = opening.tagName.getText(source);
          if (CONTROL_TAGS.has(tag)) {
            inspected += 1;
            const classes = classAttrText(opening);
            if (/\bborder-zinc-200\b/.test(classes)) {
              const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
              offenders.push(`${name}:${line + 1} <${tag}> draws its boundary from --admin-border (1.26:1)`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(offenders, "route control boundaries to border-zinc-300 (--admin-border-strong)").toEqual([]);
    // A parser that silently matched nothing would leave the assertion above trivially true.
    expect(inspected, "no interactive elements were inspected").toBeGreaterThan(20);
  });

  it("still finds the decorative token on non-control elements", () => {
    // The scan is only meaningful if the token is still in use somewhere: if every decorative
    // site had been converted, the guard would be guarding nothing.
    const hits = files.filter((file) => readFileSync(file, "utf8").includes("border-zinc-200"));
    expect(hits.length).toBeGreaterThan(5);
  });
});
