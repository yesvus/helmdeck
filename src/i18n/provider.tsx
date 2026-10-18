// SPDX-License-Identifier: MIT
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AdminLocaleAdapter } from "../adapters/host.js";
import { useAdminScopeHref } from "../scope.js";
import { defaultAdminLocale, getAdminMessageLocales, getAdminMessages, type AdminMessages } from "./messages.js";
import { clearStoredInterfaceLocale, readStoredInterfaceLocale, writeStoredInterfaceLocale } from "./preference-storage.js";

export type AdminLocalePreferenceAdapter = {
  getLocale: () => string | null | Promise<string | null>;
  setLocale: (locale: string) => void | Promise<void>;
};

const AdminI18nContext = createContext<AdminMessages>(getAdminMessages(defaultAdminLocale));

type AdminLocaleContextValue = {
  adapter?: AdminLocaleAdapter;
  contentLocale: string;
  setContentLocale: (locale: string) => void;
  interfaceLocale: string;
  setInterfaceLocale: (locale: string) => Promise<void>;
  clearInterfaceLocalePreference: () => void;
  refreshInterfaceLocalePreference: () => Promise<void>;
  availableInterfaceLocales: string[];
  toHref: (href: string) => string;
};

const AdminLocaleContext = createContext<AdminLocaleContextValue>({
  contentLocale: "",
  setContentLocale: () => {},
  interfaceLocale: defaultAdminLocale,
  setInterfaceLocale: async () => {},
  clearInterfaceLocalePreference: () => {},
  refreshInterfaceLocalePreference: async () => {},
  availableInterfaceLocales: getAdminMessageLocales(),
  toHref: (href) => href,
});

export function AdminI18nProvider({
  children,
  locale,
  messages,
  localeAdapter,
  localePreferenceAdapter,
}: {
  children: ReactNode;
  locale?: string;
  messages?: AdminMessages;
  localeAdapter?: AdminLocaleAdapter;
  localePreferenceAdapter?: AdminLocalePreferenceAdapter;
}) {
  const [adapterInterfaceLocale, setAdapterInterfaceLocale] = useState<string | null>(null);
  const [contentLocale, setContentLocaleState] = useState("");
  const [boundAdapter, setBoundAdapter] = useState(localeAdapter);
  const [preferredInterfaceLocale, setPreferredInterfaceLocale] = useState<string | null>(null);
  const [boundPreferenceAdapter, setBoundPreferenceAdapter] = useState(localePreferenceAdapter);
  const preferenceRequestRef = useRef(0);
  const preferenceWriteRef = useRef(Promise.resolve());
  const availableInterfaceLocales = useMemo(() => {
    const locales = getAdminMessageLocales();
    if (messages && !locales.some((candidate) => candidate.toLowerCase() === messages.locale.toLowerCase())) {
      locales.push(messages.locale);
    }
    return locales;
  }, [messages]);

  // Dropping the adapter invalidates whatever it resolved. That is a prop change, so it is
  // applied in render rather than in a post-paint effect write.
  if (boundAdapter !== localeAdapter) {
    setBoundAdapter(localeAdapter);
    if (!localeAdapter) {
      setAdapterInterfaceLocale(null);
      setContentLocaleState("");
    }
  }

  if (boundPreferenceAdapter !== localePreferenceAdapter) {
    setBoundPreferenceAdapter(localePreferenceAdapter);
    setPreferredInterfaceLocale(null);
  }

  useEffect(() => {
    if (!localeAdapter) {
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

  useEffect(() => {
    let active = true;
    const request = ++preferenceRequestRef.current;
    const read = Promise.resolve().then(() => localePreferenceAdapter
      ? localePreferenceAdapter.getLocale()
      : readStoredInterfaceLocale());
    void read.then((stored) => {
      const registered = availableInterfaceLocales.find((candidate) => candidate.toLowerCase() === stored?.toLowerCase());
      if (active && request === preferenceRequestRef.current && registered) {
        setPreferredInterfaceLocale(registered);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [localePreferenceAdapter, availableInterfaceLocales]);

  const activeInterfaceLocale = preferredInterfaceLocale ?? adapterInterfaceLocale ?? locale ?? messages?.locale ?? defaultAdminLocale;

  const setInterfaceLocale = useCallback((next: string) => {
    const registered = availableInterfaceLocales.find((candidate) => candidate.toLowerCase() === next.toLowerCase());
    if (!registered) return Promise.resolve();
    preferenceRequestRef.current += 1;
    setPreferredInterfaceLocale(registered);
    if (!localePreferenceAdapter) {
      writeStoredInterfaceLocale(registered);
      return Promise.resolve();
    }
    const write = preferenceWriteRef.current.then(() => localePreferenceAdapter.setLocale(registered));
    preferenceWriteRef.current = write.catch(() => {});
    return write;
  }, [availableInterfaceLocales, localePreferenceAdapter]);

  const clearInterfaceLocalePreference = useCallback(() => {
    preferenceRequestRef.current += 1;
    setPreferredInterfaceLocale(null);
    clearStoredInterfaceLocale();
  }, []);

  const refreshInterfaceLocalePreference = useCallback(() => {
    const request = ++preferenceRequestRef.current;
    const read = Promise.resolve().then(() => localePreferenceAdapter
      ? localePreferenceAdapter.getLocale()
      : readStoredInterfaceLocale());
    void read.then((stored) => {
      const registered = availableInterfaceLocales.find((candidate) => candidate.toLowerCase() === stored?.toLowerCase());
      if (request === preferenceRequestRef.current) setPreferredInterfaceLocale(registered ?? null);
    }).catch(() => {
      if (request === preferenceRequestRef.current) setPreferredInterfaceLocale(null);
    });
    return read.then(() => undefined, () => undefined);
  }, [availableInterfaceLocales, localePreferenceAdapter]);

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
      interfaceLocale: activeInterfaceLocale,
      setInterfaceLocale,
      clearInterfaceLocalePreference,
      refreshInterfaceLocalePreference,
      availableInterfaceLocales,
      toHref: localeAdapter?.toHref && contentLocale
        ? (href) => localeAdapter.toHref!(href, contentLocale)
        : (href) => href,
    }),
    [localeAdapter, contentLocale, setContentLocale, activeInterfaceLocale, setInterfaceLocale, clearInterfaceLocalePreference, refreshInterfaceLocalePreference, availableInterfaceLocales],
  );

  const activeMessages = messages && sameLanguage(messages.locale, activeInterfaceLocale)
    ? messages
    : getAdminMessages(activeInterfaceLocale);

  return (
    <AdminLocaleContext.Provider value={localeValue}>
      <AdminI18nContext.Provider value={activeMessages}>
        {children}
      </AdminI18nContext.Provider>
    </AdminLocaleContext.Provider>
  );
}

function sameLanguage(left: string, right: string) {
  return left.toLowerCase().split("-")[0] === right.toLowerCase().split("-")[0];
}

export function useAdminMessages() {
  return useContext(AdminI18nContext);
}

export function useAdminLocaleAdapter() {
  return useContext(AdminLocaleContext).adapter;
}

export function useAdminInterfaceLocale() {
  const {
    interfaceLocale,
    setInterfaceLocale,
    availableInterfaceLocales,
    clearInterfaceLocalePreference,
    refreshInterfaceLocalePreference,
  } = useContext(AdminLocaleContext);
  return { interfaceLocale, setInterfaceLocale, availableInterfaceLocales, clearInterfaceLocalePreference, refreshInterfaceLocalePreference };
}

export function useAdminContentLocale() {
  const { contentLocale, setContentLocale } = useContext(AdminLocaleContext);
  return { contentLocale, setContentLocale };
}

/** Applies the host's content locale to a shell href, leaving it untouched when the host maps no locale. */
export function useAdminHref() {
  const localeToHref = useContext(AdminLocaleContext).toHref;
  const scopeToHref = useAdminScopeHref();
  return useCallback((href: string) => {
    if (!href) return href;
    const localizedHref = localeToHref(href);
    return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) ? localizedHref : scopeToHref(localizedHref);
  }, [localeToHref, scopeToHref]);
}
