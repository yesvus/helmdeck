// SPDX-License-Identifier: MIT
"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ADMIN_THEME_PREFERENCE_STORAGE_KEY } from "./preference-boot.js";

export type AdminThemePreferenceValue = "light" | "dark" | "system";
export type AdminResolvedTheme = "light" | "dark";

export type AdminThemeValue = {
  theme: AdminThemePreferenceValue;
  resolvedTheme: AdminResolvedTheme;
  setTheme: (theme: AdminThemePreferenceValue) => void;
  ready: boolean;
};

type ThemeSnapshot = { theme: AdminThemePreferenceValue; systemTheme: AdminResolvedTheme };

const serverSnapshot: ThemeSnapshot = { theme: "system", systemTheme: "light" };
const listeners = new Set<() => void>();
let snapshot = serverSnapshot;
let memoryTheme: AdminThemePreferenceValue | null = null;
const context = createContext<AdminThemeValue | null>(null);
const outsideProvider: AdminThemeValue = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  ready: true,
};

function readStoredTheme() {
  try {
    return memoryTheme ?? window.localStorage.getItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY);
  } catch {
    return memoryTheme;
  }
}

function readSnapshot(): ThemeSnapshot {
  const stored = readStoredTheme();
  const theme: AdminThemePreferenceValue =
    stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  const systemTheme: AdminResolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  if (snapshot.theme === theme && snapshot.systemTheme === systemTheme) return snapshot;
  snapshot = { theme, systemTheme };
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = () => notify();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ADMIN_THEME_PREFERENCE_STORAGE_KEY || event.key === null) notify();
  };
  media.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const { theme, systemTheme } = useSyncExternalStore(subscribe, readSnapshot, () => serverSnapshot);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((value: AdminThemePreferenceValue) => {
    try {
      window.localStorage.setItem(ADMIN_THEME_PREFERENCE_STORAGE_KEY, value);
    } catch {
      memoryTheme = value;
      notify();
      return;
    }
    memoryTheme = null;
    notify();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = resolvedTheme;
  }, [resolvedTheme]);

  return <context.Provider value={{ theme, resolvedTheme, setTheme, ready: true }}>{children}</context.Provider>;
}

export function useAdminTheme(): AdminThemeValue {
  return useContext(context) ?? outsideProvider;
}
