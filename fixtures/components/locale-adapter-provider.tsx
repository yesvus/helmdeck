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
      <ContentLocaleSwitcher />
    </AdminI18nProvider>
  );
}

function ContentLocaleSwitcher() {
  const { contentLocale, setContentLocale } = useAdminContentLocale();
  return (
    <p className="p-4 text-sm">
      <span className="mr-2 font-semibold">İçerik dili</span>
      {CONTENT_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          aria-pressed={contentLocale === locale}
          onClick={() => setContentLocale(locale)}
          className="mr-2 underline"
        >
          {locale}
        </button>
      ))}
    </p>
  );
}
