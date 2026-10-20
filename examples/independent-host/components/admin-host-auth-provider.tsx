"use client";

import { useMemo, type ReactNode } from "react";
import { AdminAuthProvider, AdminI18nProvider, type AdminAuthAdapter } from "@yesvus/helmdeck";
import { getHostSession, loginHost, logoutHost } from "@/host/session";

export function AdminHostAuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo<AdminAuthAdapter>(() => ({
    getSession: getHostSession,
    async login(credentials) {
      const session = await loginHost(credentials.email, credentials.password);
      return session ? { ok: true, session } : { ok: false, message: "Email or password was incorrect." };
    },
    logout: logoutHost,
  }), []);

  return <AdminI18nProvider locale="en"><AdminAuthProvider adapter={adapter}>{children}</AdminAuthProvider></AdminI18nProvider>;
}
