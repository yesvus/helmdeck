// SPDX-License-Identifier: MIT
import type { CSSProperties } from "react";
import { darkenHex, lightenHex, normalizeHex } from "./color";

export function useAdminBranding(accent?: string): CSSProperties {
  if (!accent) {
    return {};
  }
  const base = normalizeHex(accent);
  if (!base) {
    return {};
  }
  return {
    "--color-brand-500": base,
    "--color-brand-600": darkenHex(base, 0.12) ?? base,
    "--color-brand-100": lightenHex(base, 0.85) ?? base,
  } as CSSProperties;
}
