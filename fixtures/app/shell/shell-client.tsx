// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import { createContext, useContext, type ReactNode } from "react";
import {
  AdminShell,
  AdminThemeSettingsProvider,
  AdminPermissionsProvider,
  type AdminDensity,
  type AdminNavGroup,
  type AdminSession,
} from "@yesvus/helmdeck";
import { useShellTheme } from "../../components/shell-theme-provider";
import { signOutAction } from "./sign-out-action";
import { demoPermissionsAdapter } from "../../lib/demo-permissions";
import { ShellVersionReadout } from "./version-readout";

// Module scope, not inside the component: the provider watches for the adapter to change and
// invalidates every cached answer when it does, so a fresh object per render would re-run that
// loop forever.
const permissions = demoPermissionsAdapter();

type ShellSettings = {
  accent: string;
  density: AdminDensity;
  siteName: string;
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
        className="rounded-md border border-zinc-300 bg-admin-surface px-2 py-1 text-xs text-zinc-700"
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
 * The accent and the density arrive as props from the layout, which read them from the store. The
 * accent used to be a constant here, which is what made the settings page's colour picker a control
 * that changed nothing; the value is now the same one the settings page writes, so the brand here
 * and the form there cannot disagree.
 *
 * They go through the package's own theme provider rather than into style attributes here. The
 * density has to reach the document root to matter at all, because `tokens.css` remaps Tailwind's
 * spacing scale through `--admin-density`, and a value set on one element would leave every other
 * element at the default.
 *
 * No colour mode is passed, so the provider derives the brand text the same way `AdminShell` derives
 * it for its own sidebar. Passing the mode would give the root a dark-correct value that the shell's
 * inline one overrides anyway, which is two behaviours where one is better.
 */
export function ShellClient({
  nav,
  session,
  accent,
  density,
  siteName,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  accent: string;
  density: AdminDensity;
  siteName: string;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={{ accent, density, siteName }}>
      <AdminPermissionsProvider adapter={permissions}>
        <AdminThemeSettingsProvider settings={{ accent, density }}>
        <AdminShell
        nav={nav}
        session={session}
        homeHref="/shell"
        viewSiteHref="/"
        profileHref="/shell/profile"
        onLogout={signOutAction}
        topbarExtra={<ThemeSelector />}
        sidebarExtra={<ShellVersionReadout />}
        profileMenuExtra={
          <Link
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            href="/dashboard"
          >
            Engine dashboard
          </Link>
        }
        brand={{
          label: siteName,
          accent,
          logo: <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">{siteName.slice(0, 1).toUpperCase()}</span>,
        }}
      >
        {children}
      </AdminShell>
        </AdminThemeSettingsProvider>
      </AdminPermissionsProvider>
    </SettingsContext.Provider>
  );
}
