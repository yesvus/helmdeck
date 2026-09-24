"use client";

import type { ReactNode } from "react";
import { AdminI18nProvider, AdminShell, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";

export function AdminWorkspace({
  nav,
  session,
  onLogout,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  return <AdminI18nProvider locale="en">
    <AdminShell nav={nav} session={session} homeHref="/admin" brand={{ label: "Sample workspace", href: "/admin" }} onLogout={onLogout}>
      {children}
    </AdminShell>
  </AdminI18nProvider>;
}
