"use client";

import { useMemo, type ReactNode } from "react";
import { AdminAuthProvider, AdminI18nProvider, type AdminAuthAdapter } from "@yesvus/helmdeck";
import { getHostSession, loginHost, logoutHost } from "@/host/session";

export function AdminHostAuthProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo<AdminAuthAdapter>(() => ({
    getSession: getHostSession,
    login: loginHost,
    logout: logoutHost,
  }), []);

  return <AdminI18nProvider locale="en"><AdminAuthProvider adapter={adapter}>{children}</AdminAuthProvider></AdminI18nProvider>;
}
