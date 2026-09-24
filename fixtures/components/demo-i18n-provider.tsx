"use client";

import type { ReactNode } from "react";
import { AdminI18nProvider } from "@yesvus/helmdeck";
import { demoCopy } from "../demo-copy";

export function DemoI18nProvider({ children }: { children: ReactNode }) {
  return (
    <AdminI18nProvider locale="en">
      {children}
    </AdminI18nProvider>
  );
}

export function useDemoLocale() {
  return { locale: "en" as const, copy: demoCopy.en };
}
