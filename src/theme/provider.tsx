"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminColorMode } from "./branding.js";
import {
  DEFAULT_ADMIN_THEME_SETTINGS,
  adminThemeSettingsStyle,
  resolveAdminThemeSettings,
  type AdminThemeSettings,
  type AdminThemeSettingsInput,
  type AdminThemeSettingsProblem,
} from "./settings.js";

/**
 * Applies a host's theme settings to the document, and reports what the theme layer did with
 * them. Storage, cross-tab sync and the colour-mode preference stay with the host, so this
 * takes a resolved mode rather than reading one.
 */
export type AdminThemeSettingsValue = {
  settings: AdminThemeSettings;
  problems: AdminThemeSettingsProblem[];
  setSettings: (input: AdminThemeSettingsInput) => void;
};

const AdminThemeSettingsContext = createContext<AdminThemeSettingsValue | null>(null);

const OUTSIDE_A_PROVIDER: AdminThemeSettingsValue = {
  settings: DEFAULT_ADMIN_THEME_SETTINGS,
  problems: [],
  setSettings: () => {},
};

export interface AdminThemeSettingsProviderProps {
  /**
   * Unvalidated, because a settings row arrives as a string from a form. Anything unusable is
   * replaced by its default and reported through `useAdminThemeSettings().problems`.
   */
  settings?: AdminThemeSettingsInput | null;
  /** Selects the `--admin-brand-text` derivation, which `tokens.css` makes per mode. */
  mode?: AdminColorMode;
  /**
   * Where the custom properties are written. The document root by default, so every component
   * follows the setting; pass an element to scope it to one subtree instead.
   */
  target?: HTMLElement | null;
  children?: ReactNode;
}

export function AdminThemeSettingsProvider({
  settings: input,
  mode = "light",
  target,
  children,
}: AdminThemeSettingsProviderProps) {
  const [overrides, setOverrides] = useState<AdminThemeSettingsInput>({});
  // Resolved during render rather than stored: the validation is pure, and a host's own
  // changes arrive as a new prop, so an effect would only add a render between the two.
  const { settings, problems } = useMemo(
    () => resolveAdminThemeSettings({ ...input, ...overrides }),
    [input, overrides],
  );

  useEffect(() => {
    const element = target ?? document.documentElement;
    const style = adminThemeSettingsStyle(settings, mode);
    for (const [name, value] of Object.entries(style)) {
      element.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(style)) {
        element.style.removeProperty(name);
      }
    };
  }, [settings, mode, target]);

  const value = useMemo<AdminThemeSettingsValue>(
    () => ({
      settings,
      problems,
      setSettings: (next) => setOverrides((current) => ({ ...current, ...next })),
    }),
    [settings, problems],
  );

  return (
    <AdminThemeSettingsContext.Provider value={value}>{children}</AdminThemeSettingsContext.Provider>
  );
}

/** The applied settings, and what was rejected. Outside a provider it reads the defaults. */
export function useAdminThemeSettings(): AdminThemeSettingsValue {
  return useContext(AdminThemeSettingsContext) ?? OUTSIDE_A_PROVIDER;
}
