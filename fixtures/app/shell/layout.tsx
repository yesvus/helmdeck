"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AdminShell } from "@yesvus/helmdeck";
import { sampleNav, sampleSession } from "../../nav";

type ShellSettings = {
  role: string;
  setRole: (value: string) => void;
  accent: string;
  setAccent: (value: string) => void;
  theme: "light" | "dark";
  setTheme: (value: "light" | "dark") => void;
};

const SettingsContext = createContext<ShellSettings | null>(null);

export function useShellSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("Shell settings are unavailable");
  return settings;
}

export function useShellTheme() {
  const settings = useContext(SettingsContext);
  return settings ? { theme: settings.theme, setTheme: settings.setTheme } : { theme: "light" as const, setTheme: () => {} };
}

export default function ShellLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState("editor");
  const [accent, setAccent] = useState("#048b8c");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [logoutMessage, setLogoutMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("helmdeck-demo-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    window.localStorage.setItem("helmdeck-demo-theme", theme);
  }, [theme]);

  return (
    <SettingsContext.Provider value={{ role, setRole, accent, setAccent, theme, setTheme }}>
      <AdminShell
        nav={sampleNav}
        session={{ ...sampleSession, role }}
        homeHref="/shell"
        viewSiteHref="/"
        profileHref="/shell/profile"
        onLogout={() => setLogoutMessage("Demo sign-out confirmed. Your account session remains managed by the host application.")}
        topbarExtra={<><label className="flex items-center gap-2 text-xs font-medium text-zinc-600">Theme<select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as "light" | "dark")} className="rounded-md border border-zinc-300 bg-admin-surface px-2 py-1.5 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"><option value="light">Light</option><option value="dark">Dark</option></select></label>{logoutMessage ? <span role="status" className="max-w-56 text-xs text-zinc-600">{logoutMessage}</span> : null}</>}
        brand={{
          label: "Northstar Supply",
          accent,
          logo: <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">N</span>,
        }}
      >
        {children}
      </AdminShell>
    </SettingsContext.Provider>
  );
}
