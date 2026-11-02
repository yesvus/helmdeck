// SPDX-License-Identifier: MIT
import type { CSSProperties } from "react";

export function resolveAdminThemeAttrs(settings: { accent?: unknown; density?: unknown }, mode: "light" | "dark" = "light") {
  const accent = typeof settings.accent === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(settings.accent.trim())
    ? settings.accent.trim()
    : undefined;
  const density = settings.density === "compact"
    ? "compact"
    : settings.density === "cosy" ? "spacious"
      : settings.density === "comfortable" ? "comfortable" : undefined;
  return {
    "data-theme": mode,
    "data-admin-theme": mode,
    "data-admin-accent": accent,
    "data-admin-density": density,
    style: {
      ...(accent ? { "--admin-brand-500": accent, "--theme-primary-500": accent, "--theme-accent": accent } : {}),
      ...(density ? { "--admin-density": density === "compact" ? "0.85" : density === "spacious" ? "1.15" : "1" } : {}),
    } as CSSProperties,
  };
}

export function resolvePayloadDocumentTheme(cookieValue: string | null, settings: { accent?: unknown; density?: unknown }) {
  const mode = cookieValue === "v1:dark" ? "dark" : "light";
  return { mode, attrs: resolveAdminThemeAttrs(settings, mode) };
}
