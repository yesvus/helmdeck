"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

export type ShellThemePreference = "light" | "dark" | "system";

type ShellTheme = {
  theme: ShellThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (value: ShellThemePreference) => void;
  ready: boolean;
};

const ShellThemeContext = createContext<ShellTheme | null>(null);

const storageKey = "helmdeck-demo-theme";
const darkQuery = "(prefers-color-scheme: dark)";

type ShellThemeSnapshot = { theme: ShellThemePreference; systemTheme: "light" | "dark" };

// The stored preference and the OS preference are external stores, so they are read
// through useSyncExternalStore rather than copied into state from an effect. Reading them
// in a state initializer is not an option either, because these pages are server
// rendered and a client-only initializer would break hydration.
const serverSnapshot: ShellThemeSnapshot = { theme: "light", systemTheme: "light" };
const listeners = new Set<() => void>();
let snapshot = serverSnapshot;

function readSnapshot(): ShellThemeSnapshot {
  const saved = window.localStorage.getItem(storageKey);
  const theme: ShellThemePreference =
    saved === "light" || saved === "dark" || saved === "system" ? saved : "light";
  // Not cached at module scope on purpose: a cached MediaQueryList would go stale when a
  // host or a test swaps window.matchMedia, which the theme tests rely on.
  const systemTheme: "light" | "dark" = window.matchMedia(darkQuery).matches ? "dark" : "light";
  // useSyncExternalStore requires a stable reference between calls.
  if (snapshot.theme === theme && snapshot.systemTheme === systemTheme) return snapshot;
  snapshot = { theme, systemTheme };
  return snapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Resolved per subscription rather than cached at module scope, so a host or a test that
  // swaps window.matchMedia is honored.
  const media = window.matchMedia(darkQuery);
  const handleMediaChange = () => notify();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) notify();
  };
  media.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useShellTheme() {
  const theme = useContext(ShellThemeContext);
  return theme ?? { theme: "light", resolvedTheme: "light", setTheme: () => {}, ready: true };
}

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const { theme, systemTheme } = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((value: ShellThemePreference) => {
    window.localStorage.setItem(storageKey, value);
    // localStorage does not fire a storage event in the document that wrote it, so the
    // subscribers are notified here instead.
    notify();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = resolvedTheme;
  }, [resolvedTheme]);

  const value: ShellTheme = { theme, resolvedTheme, setTheme, ready: true };
  return <ShellThemeContext.Provider value={value}>{children}</ShellThemeContext.Provider>;
}
