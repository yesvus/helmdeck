// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import { createContext, useContext, type ReactNode } from "react";
import { AdminShell, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";
import { useShellTheme } from "../../components/shell-theme-provider";
import { signOutAction } from "./sign-out-action";

type ShellSettings = {
  accent: string;
};

const SettingsContext = createContext<ShellSettings | null>(null);

export function useShellSettings() {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("Shell settings are unavailable");
  return settings;
}

function ThemeSelector() {
  const { theme, setTheme } = useShellTheme();
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
      Theme
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as typeof theme)}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}

/**
 * The shell's client half: presentation, theme, and a sign-out that actually ends the session.
 *
 * The accent is fixed rather than switchable. It was a local state a visitor could change, which made
 * the demo look configurable where it was not, and accent editing is a settings surface milestone
 * rather than something a shell layout should carry.
 */
export function ShellClient({
  nav,
  session,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  children: ReactNode;
}) {
  const accent = "#b45309";

  return (
    <SettingsContext.Provider value={{ accent }}>
      <AdminShell
        nav={nav}
        session={session}
        homeHref="/shell"
        viewSiteHref="/"
        profileHref="/shell/profile"
        onLogout={signOutAction}
        topbarExtra={<ThemeSelector />}
        profileMenuExtra={
          <Link
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            href="/dashboard"
          >
            Engine dashboard
          </Link>
        }
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
