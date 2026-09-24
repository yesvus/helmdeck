// SPDX-License-Identifier: MIT
import type { CSSProperties } from "react";
import { darkenHex, lightenHex, normalizeHex } from "./color.js";

export function useAdminBranding(accent?: string): CSSProperties {
  if (!accent) {
    return {};
  }
  const base = normalizeHex(accent);
  if (!base) {
    return {};
  }
  return {
    "--admin-brand-500": base,
    "--admin-brand-600": darkenHex(base, 0.3) ?? base,
    "--admin-brand-100": lightenHex(base, 0.85) ?? base,
  } as CSSProperties;
}
