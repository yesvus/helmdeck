"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AdminShell } from "@yesvus/helmdeck";
import { sampleNav, sampleSession } from "../../nav";

type ShellSettings = {
  role: string;
  setRole: (value: string) => void;
  accent: string;
  setAccent: (value: string) => void;
};

const SettingsContext = createContext<ShellSettings | null>(null);

export function useShellSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("Shell settings are unavailable");
  return settings;
}

export default function ShellLayout({ children }: { children: ReactNode }) {
  const [role, setRole] = useState("editor");
  const [accent, setAccent] = useState("#048b8c");

  return (
    <SettingsContext.Provider value={{ role, setRole, accent, setAccent }}>
      <AdminShell
        nav={sampleNav}
        session={{ ...sampleSession, role }}
        homeHref="/shell"
        viewSiteHref="/"
        onLogout={() => window.alert("logout tapped")}
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
