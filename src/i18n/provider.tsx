// SPDX-License-Identifier: MIT
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminLocaleAdapter } from "../adapters/host.js";
import { defaultAdminLocale, getAdminMessages, type AdminMessages } from "./messages.js";

const AdminI18nContext = createContext<AdminMessages>(getAdminMessages(defaultAdminLocale));

type AdminLocaleContextValue = {
  adapter?: AdminLocaleAdapter;
  contentLocale: string;
  setContentLocale: (locale: string) => void;
  toHref: (href: string) => string;
};

const AdminLocaleContext = createContext<AdminLocaleContextValue>({
  contentLocale: "",
  setContentLocale: () => {},
  toHref: (href) => href,
});

export function AdminI18nProvider({
  children,
  locale,
  messages,
  localeAdapter,
}: {
  children: ReactNode;
  locale?: string;
  messages?: AdminMessages;
  localeAdapter?: AdminLocaleAdapter;
}) {
  const [adapterInterfaceLocale, setAdapterInterfaceLocale] = useState<string | null>(null);
  const [contentLocale, setContentLocaleState] = useState("");

  useEffect(() => {
    if (!localeAdapter) {
      setAdapterInterfaceLocale(null);
      setContentLocaleState("");
      return;
    }
    let active = true;
    void Promise.resolve(localeAdapter.getInterfaceLocale()).then((resolved) => {
      if (active && resolved) setAdapterInterfaceLocale(resolved);
    });
    void Promise.resolve(localeAdapter.getContentLocale()).then((resolved) => {
      if (active && resolved) setContentLocaleState(resolved);
    });
    return () => {
      active = false;
    };
  }, [localeAdapter]);

  const activeInterfaceLocale = adapterInterfaceLocale ?? locale ?? defaultAdminLocale;

  const setContentLocale = useCallback(
    (next: string) => {
      setContentLocaleState(next);
      void localeAdapter?.setContentLocale?.(next);
    },
    [localeAdapter],
  );

  const localeValue = useMemo<AdminLocaleContextValue>(
    () => ({
      adapter: localeAdapter,
      contentLocale,
      setContentLocale,
      toHref: localeAdapter?.toHref && contentLocale
        ? (href) => localeAdapter.toHref!(href, contentLocale)
        : (href) => href,
    }),
    [localeAdapter, contentLocale, setContentLocale],
  );

  return (
    <AdminLocaleContext.Provider value={localeValue}>
      <AdminI18nContext.Provider value={messages ?? getAdminMessages(activeInterfaceLocale)}>
        {children}
      </AdminI18nContext.Provider>
    </AdminLocaleContext.Provider>
  );
}

export function useAdminMessages() {
  return useContext(AdminI18nContext);
}

export function useAdminLocaleAdapter() {
  return useContext(AdminLocaleContext).adapter;
}

export function useAdminContentLocale() {
  const { contentLocale, setContentLocale } = useContext(AdminLocaleContext);
  return { contentLocale, setContentLocale };
}

/** Applies the host's content locale to a shell href, leaving it untouched when the host maps no locale. */
export function useAdminHref() {
  return useContext(AdminLocaleContext).toHref;
}
