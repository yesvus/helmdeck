// SPDX-License-Identifier: MIT
export { useAdminBranding } from "./branding.js";
export {
  ADMIN_BRAND_VARIABLES,
  ADMIN_SURFACES,
  ADMIN_TEXT_CONTRAST,
  adminBrandVariables,
  describeAccentRejection,
} from "./branding.js";
export type { AdminAccentRejection, AdminBrandVariables, AdminColorMode } from "./branding.js";
export { contrastingTextHex, contrastRatio, darkenHex, lightenHex, mixHex, normalizeHex } from "./color.js";
export {
  ADMIN_DENSITIES,
  ADMIN_DENSITY_SCALE,
  ADMIN_DENSITY_VARIABLE,
  DEFAULT_ADMIN_DENSITY,
  adminDensityScale,
  isAdminDensity,
} from "./density.js";
export type { AdminDensity } from "./density.js";
export {
  ADMIN_THEME_SETTING_KEYS,
  DEFAULT_ADMIN_THEME_SETTINGS,
  adminThemeSettingsStyle,
  resolveAdminThemeSettings,
} from "./settings.js";
export type {
  AdminThemeSettings,
  AdminThemeSettingsInput,
  AdminThemeSettingsProblem,
} from "./settings.js";
export { AdminThemeSettingsProvider, useAdminThemeSettings } from "./provider.js";
export type { AdminThemeSettingsProviderProps, AdminThemeSettingsValue } from "./provider.js";
