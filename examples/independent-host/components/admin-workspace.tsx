"use client";

import type { ReactNode } from "react";
import { Suspense, useMemo } from "react";
import { AdminPermissionsProvider, AdminShell, AdminThemePreference, AdminRequireSession, useAdminSession, type AdminNavGroup, type AdminPermissionsAdapter } from "@yesvus/helmdeck";

export function AdminWorkspace({
  nav,
  children,
}: {
  nav: AdminNavGroup[];
  children: ReactNode;
}) {
  const { session, logout } = useAdminSession();
  const permissions = useMemo<AdminPermissionsAdapter>(() => ({
    can: async () => session?.role === "editor",
  }), [session?.role]);
  if (!session) {
    return (
      <Suspense fallback={<p className="p-8" role="status">Checking your session…</p>}>
        <AdminRequireSession loginHref="/login">{children}</AdminRequireSession>
      </Suspense>
    );
  }

  return <AdminPermissionsProvider adapter={permissions}>
    <AdminShell
      nav={nav}
      session={session}
      homeHref="/admin"
      onLogout={logout}
      brand={{ label: "Sample workspace", href: "/admin" }}
      topbarExtra={<AdminThemePreference />}
    >
      {children}
    </AdminShell>
  </AdminPermissionsProvider>;
}
