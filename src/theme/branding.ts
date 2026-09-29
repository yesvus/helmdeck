// SPDX-License-Identifier: MIT
import type { CSSProperties } from "react";
import { contrastRatio, darkenHex, lightenHex, mixHex, normalizeHex } from "./color.js";

/** WCAG 1.4.3 for normal text, the threshold `tests/theme-contrast.test.ts` holds the palette to. */
export const ADMIN_TEXT_CONTRAST = 4.5;

/** The near-black the token layer uses for foreground ink, the same value as `--admin-on-*`. */
const INK = "#1c1917";
const WHITE = "#ffffff";
const BLACK = { r: 0, g: 0, b: 0 };
const PURE_WHITE = { r: 255, g: 255, b: 255 };

/** How far the hover fill moves from the resting one, the same 30% `useAdminBranding` used. */
const HOVER_SHIFT = 0.3;

/**
 * The surfaces a brand text colour has to stay readable on, per mode. `tokens.css` is the
 * source of truth for the values; `tests/theme-settings.test.ts` fails if the two drift.
 */
export const ADMIN_SURFACES = {
  light: { surface: "#ffffff", subtle: "#fafaf9" },
  dark: { surface: "#1c1917", subtle: "#0c0a09" },
} as const;

export type AdminColorMode = keyof typeof ADMIN_SURFACES;

export const ADMIN_BRAND_VARIABLES = [
  "--admin-brand-100",
  "--admin-brand-500",
  "--admin-brand-600",
  "--admin-brand-text",
  "--admin-on-brand",
] as const;

export type AdminBrandVariables = Record<(typeof ADMIN_BRAND_VARIABLES)[number], string>;

export type AdminAccentRejection = {
  accent: string;
  /** The best ratio either label colour reaches on this accent, for a message that can advise. */
  best: number | null;
  reason: string;
};

type AccentFill = { label: string; hover: string; ratio: number };

/**
 * The label colour a fill can carry, which is whichever of white or the palette's ink reads
 * better on it. A mid-tone such as #808080 reads at 4.43:1 with ink and 3.95:1 with white, so
 * there is no label colour that clears the threshold at all. That is the case an accent has
 * to be refused for: the host picked the button colour, and no label colour works on it.
 */
function labelFor(fill: string): { label: string; ratio: number } | null {
  const onWhite = contrastRatio(WHITE, fill);
  const onInk = contrastRatio(INK, fill);
  if (onWhite === null || onInk === null) return null;
  return onWhite >= onInk ? { label: WHITE, ratio: onWhite } : { label: INK, ratio: onInk };
}

/**
 * The resting fill, its hover fill and the label that carries both.
 *
 * The hover moves away from the label rather than always downward. Darkening an accent that
 * takes a dark label is what makes a visible hover collide with the label: #1d9bf0 reads at
 * 5.83:1 with ink and 3.9:1 on a 30% darker shade, so darkening it would either fail the
 * threshold or leave no hover at all. Moving away keeps the hover visible and the label
 * legible at the same time, and it is the same darkening the token palette already uses for
 * an accent that takes white.
 */
function accentFill(base: string): AccentFill | null {
  const resting = labelFor(base);
  if (!resting || resting.ratio < ADMIN_TEXT_CONTRAST) return null;
  const away =
    (resting.label === WHITE ? darkenHex(base, HOVER_SHIFT) : lightenHex(base, HOVER_SHIFT)) ?? base;
  // An accent that is already the far end of that direction has no room to move, so it moves
  // the other way rather than rendering a hover identical to the resting fill.
  const other =
    (resting.label === WHITE ? lightenHex(base, HOVER_SHIFT) : darkenHex(base, HOVER_SHIFT)) ?? base;
  const hover = away === base ? other : away;
  const onHover = contrastRatio(resting.label, hover);
  if (onHover === null || onHover < ADMIN_TEXT_CONTRAST) return null;
  return { label: resting.label, hover, ratio: Math.min(resting.ratio, onHover) };
}

/**
 * Brand text as a usable colour rather than the `color-mix` expression `tokens.css` uses.
 * That expression is right for the default amber and wrong for a light accent, where
 * 80% of the accent on a white surface reads at 0.5:1. The mix is therefore the starting
 * point and the walk toward the far end of the surface's own scale is what makes it legible,
 * which is bounded by the fact that ink on white and white on near-black both clear 4.5:1.
 *
 * Both surfaces of the mode are measured, not the harder-looking one. Which is harder depends
 * on the direction: near-white is the harder background for dark text and the easier one for
 * light text, so measuring a single surface would pass whichever pair nobody looked at.
 */
function brandText(accent: string, mode: AdminColorMode): string {
  const { surface, subtle } = ADMIN_SURFACES[mode];
  const legible = (colour: string) =>
    [surface, subtle].every((background) => {
      const ratio = contrastRatio(colour, background);
      return ratio !== null && ratio >= ADMIN_TEXT_CONTRAST;
    });
  const start =
    mode === "dark"
      ? mixHex(accent, PURE_WHITE, 0.65)
      : mixHex(accent, BLACK, 0.2);
  let colour = start ?? accent;
  for (let step = 0; step < 40 && !legible(colour); step += 1) {
    colour = (mode === "dark" ? lightenHex(colour, 0.1) : darkenHex(colour, 0.1)) ?? colour;
  }
  return colour;
}

/**
 * The brand token values a host accent produces, or null when the accent is refused.
 *
 * Refusal is mode-independent, so a host gets the same answer whatever the colour mode is,
 * and falls back to the palette in `tokens.css` rather than to an unreadable label.
 */
export function adminBrandVariables(
  accent: string,
  mode: AdminColorMode = "light",
): AdminBrandVariables | null {
  const base = normalizeHex(accent);
  if (!base) return null;
  const fill = accentFill(base);
  if (!fill) return null;
  return {
    "--admin-brand-500": base,
    "--admin-brand-600": fill.hover,
    "--admin-brand-100": lightenHex(base, 0.85) ?? base,
    "--admin-on-brand": fill.label,
    "--admin-brand-text": brandText(base, mode),
  };
}

/** Why an accent was refused, with the ratio that decided it, for a message a host can act on. */
export function describeAccentRejection(value: unknown): AdminAccentRejection {
  const accent = typeof value === "string" ? value : String(value);
  const base = normalizeHex(accent);
  const best = base ? labelFor(base)?.ratio ?? null : null;
  return {
    accent,
    best,
    reason:
      `No label colour clears ${ADMIN_TEXT_CONTRAST}:1 on ${accent}` +
      (best === null ? "." : `; the best is ${best.toFixed(2)}:1.`) +
      " Choose an accent that is lighter or darker.",
  };
}

/**
 * Brand variables for a host accent, as a style object. An accent that is missing or refused
 * yields no variables at all, which leaves the contrast-checked palette in `tokens.css`
 * standing rather than overriding it with something unreadable.
 */
export function useAdminBranding(accent?: string | null, mode: AdminColorMode = "light"): CSSProperties {
  const normalised = typeof accent === "string" ? accent.trim() : "";
  if (!normalised) return {};
  const variables = adminBrandVariables(normalised, mode);
  return variables ? ({ ...variables } as CSSProperties) : {};
}
