// SPDX-License-Identifier: MIT
"use client";

import { useState, type ReactNode } from "react";
import {
  AdminI18nProvider,
  useAdminContentLocale,
  type AdminLocaleAdapter,
} from "@yesvus/helmdeck";

const INTERFACE_LOCALE = "tr";
const CONTENT_LOCALES = ["tr", "en"] as const;

function withContentLocale(href: string, contentLocale: string) {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("locale", contentLocale);
  return `${path}?${params.toString()}`;
}

export function LocaleAdapterProvider({ children }: { children: ReactNode }) {
  const [contentLocale, setContentLocale] = useState<string>("en");

  const adapter: AdminLocaleAdapter = {
    getInterfaceLocale: () => INTERFACE_LOCALE,
    getContentLocale: () => contentLocale,
    setContentLocale,
    toHref: withContentLocale,
  };

  return (
    <AdminI18nProvider localeAdapter={adapter}>
      {children}
    </AdminI18nProvider>
  );
}

export function ContentLocaleSwitcher() {
  const { contentLocale, setContentLocale } = useAdminContentLocale();
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-semibold text-zinc-600">İçerik dili:</span>
      {CONTENT_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-pressed={contentLocale === locale}
          onClick={() => setContentLocale(locale)}
          className={`rounded px-2 py-1 font-medium transition-colors ${
            contentLocale === locale
              ? "bg-brand-500 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
