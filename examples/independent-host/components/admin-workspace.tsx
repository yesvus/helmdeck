"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  AdminI18nProvider,
  AdminPermissionsProvider,
  AdminShell,
  AdminThemePreference,
  type AdminNavGroup,
  type AdminSession,
  type AdminPermissionsAdapter,
} from "@yesvus/helmdeck";

export function AdminWorkspace({
  nav,
  session,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  children: ReactNode;
}) {
  const permissions = useMemo<AdminPermissionsAdapter>(() => ({
    can: async () => session.role === "editor",
  }), [session.role]);

  return <AdminPermissionsProvider adapter={permissions}><AdminI18nProvider locale="en">
    <AdminShell
      nav={nav}
      session={session}
      homeHref="/admin"
      brand={{ label: "Sample workspace", href: "/admin" }}
      topbarExtra={<AdminThemePreference />}
    >
      {children}
    </AdminShell>
  </AdminI18nProvider></AdminPermissionsProvider>;
}
