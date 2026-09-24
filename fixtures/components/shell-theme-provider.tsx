"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ShellTheme = {
  theme: "light" | "dark";
  setTheme: (value: "light" | "dark") => void;
  ready: boolean;
};

const ShellThemeContext = createContext<ShellTheme | null>(null);

export function useShellTheme() {
  const theme = useContext(ShellThemeContext);
  return theme ?? { theme: "light", setTheme: () => {}, ready: true };
}

export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("helmdeck-demo-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.adminTheme = theme;
    window.localStorage.setItem("helmdeck-demo-theme", theme);
  }, [ready, theme]);

  return <ShellThemeContext.Provider value={{ theme, setTheme, ready }}>{children}</ShellThemeContext.Provider>;
}
