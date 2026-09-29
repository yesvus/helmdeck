// SPDX-License-Identifier: MIT
import type { CSSProperties } from "react";
import { adminBrandVariables, describeAccentRejection, type AdminColorMode } from "./branding.js";
import {
  ADMIN_DENSITIES,
  DEFAULT_ADMIN_DENSITY,
  adminDensityScale,
  isAdminDensity,
  type AdminDensity,
} from "./density.js";
import { normalizeHex } from "./color.js";

/**
 * What a host can change about the theme, with a default for each. A host that sets nothing
 * gets the palette in `tokens.css` and the density the token already declared.
 */
export type AdminThemeSettings = {
  /** Compact, comfortable or spacious. Scales the Tailwind spacing the whole package uses. */
  density: AdminDensity;
  /** A 3 or 6 digit hex, or null to keep the palette in `tokens.css`. */
  accent: string | null;
};

export const DEFAULT_ADMIN_THEME_SETTINGS: AdminThemeSettings = {
  density: DEFAULT_ADMIN_DENSITY,
  accent: null,
};

export const ADMIN_THEME_SETTING_KEYS = ["density", "accent"] as const;

export type AdminThemeSettingsInput = Partial<Record<keyof AdminThemeSettings, unknown>>;

/** A setting the host supplied that the theme layer would not use, and why. */
export type AdminThemeSettingsProblem = {
  setting: string;
  value: unknown;
  reason: string;
};

export type { AdminColorMode };

/**
 * Validates a host's settings and fills in the defaults. A value it cannot use is reported
 * and replaced by the default rather than thrown, so one bad row in a settings table cannot
 * leave an admin with no theme at all.
 */
export function resolveAdminThemeSettings(input: unknown): {
  settings: AdminThemeSettings;
  problems: AdminThemeSettingsProblem[];
} {
  const problems: AdminThemeSettingsProblem[] = [];
  const settings: AdminThemeSettings = { ...DEFAULT_ADMIN_THEME_SETTINGS };

  if (input === undefined || input === null) {
    return { settings, problems };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      settings,
      problems: [{ setting: "settings", value: input, reason: "Settings must be an object." }],
    };
  }

  const values = input as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!(ADMIN_THEME_SETTING_KEYS as readonly string[]).includes(key)) {
      problems.push({ setting: key, value: values[key], reason: "Unknown setting." });
    }
  }

  if (Object.hasOwn(values, "density") && values.density !== undefined) {
    if (isAdminDensity(values.density)) {
      settings.density = values.density;
    } else {
      problems.push({
        setting: "density",
        value: values.density,
        reason: `Density must be one of ${ADMIN_DENSITIES.join(", ")}.`,
      });
    }
  }

  if (Object.hasOwn(values, "accent") && values.accent !== undefined && values.accent !== null) {
    if (typeof values.accent !== "string") {
      problems.push({ setting: "accent", value: values.accent, reason: "Accent must be a hex colour." });
    } else if (values.accent.trim() === "") {
      // An unset accent, which is what an empty settings row is, is not a mistake.
      settings.accent = null;
    } else {
      const hex = normalizeHex(values.accent);
      if (!hex) {
        problems.push({ setting: "accent", value: values.accent, reason: "Accent must be a 3 or 6 digit hex colour." });
      } else if (!adminBrandVariables(hex)) {
        problems.push({ setting: "accent", value: values.accent, ...describeAccentRejection(hex) });
      } else {
        settings.accent = hex;
      }
    }
  }

  return { settings, problems };
}

/**
 * The custom properties a host's settings produce. A refused accent contributes nothing, so
 * the contrast-checked palette in `tokens.css` keeps standing rather than being replaced with
 * a colour pair the theme layer would not accept.
 *
 * The mode matters for `--admin-brand-text` alone, which `tokens.css` derives per mode. A
 * server-rendered host can spread this onto its document element to avoid a flash, because it
 * needs no browser state.
 */
export function adminThemeSettingsStyle(
  settings: AdminThemeSettings,
  mode: AdminColorMode = "light",
): CSSProperties {
  const variables: Record<string, string> = {
    "--admin-density": adminDensityScale(settings.density),
  };
  if (settings.accent) {
    Object.assign(variables, adminBrandVariables(settings.accent, mode) ?? {});
  }
  return variables as CSSProperties;
}
