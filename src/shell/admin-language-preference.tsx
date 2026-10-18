// SPDX-License-Identifier: MIT
"use client";

import { AdminSectionCard } from "../primitives/layout.js";
import { useAdminMessages, useAdminInterfaceLocale } from "../i18n.js";
import { Languages } from "lucide-react";

export function AdminLanguagePreference() {
  const messages = useAdminMessages();
  const { interfaceLocale, setInterfaceLocale, availableInterfaceLocales } = useAdminInterfaceLocale();

  return (
    <AdminSectionCard
      id="interface-language"
      icon={Languages}
      title={messages.languagePreference.label}
      description={messages.languagePreference.description}
    >
      <div className="space-y-1">
        <label htmlFor="admin-interface-language" className="block text-sm font-medium text-admin-foreground">
          {messages.languagePreference.label}
        </label>
        <select
          id="admin-interface-language"
          value={interfaceLocale}
          onChange={(event) => setInterfaceLocale(event.currentTarget.value)}
          aria-describedby="admin-interface-language-description"
          className="w-full rounded-md border border-admin-border bg-admin-surface px-3 py-2 text-sm"
        >
          {availableInterfaceLocales.map((locale) => (
            <option key={locale} value={locale}>{localeName(locale)}</option>
          ))}
        </select>
        <p id="admin-interface-language-description" className="text-xs text-admin-muted-foreground">
          {messages.languagePreference.description}
        </p>
      </div>
    </AdminSectionCard>
  );
}

function localeName(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}
