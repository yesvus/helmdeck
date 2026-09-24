"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AdminI18nProvider, Button } from "@yesvus/helmdeck";
import { demoCopy, type DemoLocale } from "../demo-copy";

const DemoLocaleContext = createContext<{
  locale: DemoLocale;
  setLocale: (locale: DemoLocale) => void;
}>({ locale: "en", setLocale: () => {} });

export function DemoI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<DemoLocale>("en");

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <AdminI18nProvider locale={locale}>
      <DemoLocaleContext.Provider value={{ locale, setLocale }}>
        {children}
      </DemoLocaleContext.Provider>
    </AdminI18nProvider>
  );
}

export function useDemoLocale() {
  const value = useContext(DemoLocaleContext);
  return { ...value, copy: demoCopy[value.locale] };
}

export function DemoPageBar() {
  return (
    <div className="mb-6 flex justify-end">
      <DemoLanguageSwitcher />
    </div>
  );
}

export function DemoLanguageSwitcher() {
  const { locale, setLocale } = useDemoLocale();

  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1">
      {(["en", "tr"] as const).map((item) => (
        <Button
          key={item}
          aria-pressed={locale === item}
          onClick={() => setLocale(item)}
          size="sm"
          variant={locale === item ? "default" : "ghost"}
        >
          {item === "en" ? "English" : "Türkçe"}
        </Button>
      ))}
    </div>
  );
}
