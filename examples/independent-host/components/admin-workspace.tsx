"use client";

import type { ReactNode } from "react";
import { AdminI18nProvider, AdminShell, AdminThemePreference, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";

export function AdminWorkspace({
  nav,
  session,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  children: ReactNode;
}) {
  return <AdminI18nProvider locale="en">
    <AdminShell
      nav={nav}
      session={session}
      homeHref="/admin"
      brand={{ label: "Sample workspace", href: "/admin" }}
      topbarExtra={<AdminThemePreference />}
    >
      {children}
    </AdminShell>
  </AdminI18nProvider>;
}
