// SPDX-License-Identifier: MIT
"use client";

import { useAdminMessages } from "../i18n.js";
import { useAdminTheme, type AdminThemePreferenceValue } from "./preference.js";

export function AdminThemePreference({
  onThemeChange,
}: {
  onThemeChange?: (theme: AdminThemePreferenceValue) => void;
}) {
  const messages = useAdminMessages().themePreference;
  const { theme, setTheme } = useAdminTheme();

  function changeTheme(value: AdminThemePreferenceValue) {
    setTheme(value);
    onThemeChange?.(value);
  }

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-admin-muted">
      {messages.label}
      <select
        aria-label={messages.label}
        value={theme}
        onChange={(event) => changeTheme(event.target.value as AdminThemePreferenceValue)}
        className="rounded-md border border-admin-border bg-admin-surface px-2 py-1 text-xs text-admin-foreground"
      >
        <option value="light">{messages.light}</option>
        <option value="dark">{messages.dark}</option>
        <option value="system">{messages.system}</option>
      </select>
    </label>
  );
}
