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
// Matches the client default so that, on a light-OS visitor with no stored preference,
// readSnapshot returns this exact object and useSyncExternalStore does not re-render after
// hydration. A dark-OS visitor still differs on systemTheme and re-renders, which is
// unavoidable since a server cannot know the preference.
const serverSnapshot: ShellThemeSnapshot = { theme: "system", systemTheme: "light" };
const listeners = new Set<() => void>();
let snapshot = serverSnapshot;

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
    return null;
  }
}

function readSnapshot(): ShellThemeSnapshot {
  const saved = readStoredTheme();
  const theme: ShellThemePreference =
    saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
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
    // A null key means the whole store was cleared, which also drops the preference.
    if (event.key === storageKey || event.key === null) notify();
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
  // Matches the provider default. resolvedTheme stays light because a consumer without a
  // provider has no way to read the operating system preference.
  return theme ?? { theme: "system", resolvedTheme: "light", setTheme: () => {}, ready: true };
}

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const { theme, systemTheme } = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((value: ShellThemePreference) => {
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // A failed write must not abort the handler, or the subscribers never re-render
      // and the control keeps the old selection. The preference simply will not persist.
    }
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
