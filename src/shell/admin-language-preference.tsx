// SPDX-License-Identifier: MIT
"use client";

import { AdminSectionCard } from "../primitives/layout.js";
import { useAdminMessages, useAdminInterfaceLocale } from "../i18n.js";
import { Languages } from "lucide-react";
import { useRef, useState } from "react";

export function AdminLanguagePreference() {
  const messages = useAdminMessages();
  const { interfaceLocale, setInterfaceLocale, availableInterfaceLocales } = useAdminInterfaceLocale();
  const [saveFailed, setSaveFailed] = useState(false);
  const selectionRequest = useRef(0);
  const selectedLocale = availableInterfaceLocales.find((locale) => locale.toLowerCase() === interfaceLocale.toLowerCase())
    ?? availableInterfaceLocales.find((locale) => locale.toLowerCase().split("-")[0] === interfaceLocale.toLowerCase().split("-")[0])
    ?? availableInterfaceLocales.find((locale) => locale.toLowerCase() === "en")
    ?? availableInterfaceLocales[0];

  return (
    <AdminSectionCard
      id="interface-language"
      icon={Languages}
      title={messages.languagePreference.label}
    >
      <div className="space-y-1">
        <label htmlFor="admin-interface-language" className="block text-sm font-medium text-admin-foreground">
          {messages.languagePreference.label}
        </label>
        <select
          id="admin-interface-language"
          value={selectedLocale}
          onChange={(event) => {
            const request = ++selectionRequest.current;
            setSaveFailed(false);
            void setInterfaceLocale(event.currentTarget.value).catch(() => {
              if (request === selectionRequest.current) setSaveFailed(true);
            });
          }}
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
        {saveFailed && <p role="alert" className="text-xs text-red-600">{messages.languagePreference.saveFailed}</p>}
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
