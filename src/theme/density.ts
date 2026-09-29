// SPDX-License-Identifier: MIT
/**
 * Density steps a host picks between, and the multiplier the layout resolves through.
 *
 * `--admin-density` reaches rendered output through the Tailwind spacing scale rather than
 * through per-component work: `src/theme/tokens.css` remaps `--spacing` to
 * `calc(0.25rem * var(--admin-density))`, so every `p-*`, `gap-*`, `space-*` and fixed-height
 * utility in the package scales with it.
 */

/** Ordered from tightest to loosest, so a host can render them in a select in this order. */
export const ADMIN_DENSITIES = ["compact", "comfortable", "spacious"] as const;

export type AdminDensity = (typeof ADMIN_DENSITIES)[number];

/**
 * Unitless multipliers rather than rem values, because the token feeds a `calc()` multiplier.
 * `comfortable` is 1, which is what the token declared before density was a setting, so
 * leaving density alone renders byte-for-byte what it always did.
 */
export const ADMIN_DENSITY_SCALE: Record<AdminDensity, string> = {
  compact: "0.85",
  comfortable: "1",
  spacious: "1.15",
};

export const DEFAULT_ADMIN_DENSITY: AdminDensity = "comfortable";

/** The custom property the CSS and the Tailwind spacing remap both read. */
export const ADMIN_DENSITY_VARIABLE = "--admin-density";

export function isAdminDensity(value: unknown): value is AdminDensity {
  return typeof value === "string" && (ADMIN_DENSITIES as readonly string[]).includes(value);
}

export function adminDensityScale(density: AdminDensity): string {
  return ADMIN_DENSITY_SCALE[density];
}
