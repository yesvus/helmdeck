"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ShellThemePreference = "light" | "dark" | "system";

type ShellTheme = {
  theme: ShellThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (value: ShellThemePreference) => void;
  ready: boolean;
};

const ShellThemeContext = createContext<ShellTheme | null>(null);

export function useShellTheme() {
  const theme = useContext(ShellThemeContext);
  return theme ?? { theme: "light", resolvedTheme: "light", setTheme: () => {}, ready: true };
}

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ShellThemePreference>("light");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    const saved = window.localStorage.getItem("helmdeck-demo-theme");
    if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
    setReady(true);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.adminTheme = resolvedTheme;
    window.localStorage.setItem("helmdeck-demo-theme", theme);
  }, [ready, resolvedTheme, theme]);

  return <ShellThemeContext.Provider value={{ theme, resolvedTheme, setTheme, ready }}>{children}</ShellThemeContext.Provider>;
}
