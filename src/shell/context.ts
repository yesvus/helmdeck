import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AdminNavGroup, AdminSession } from "../adapters";
import type { AdminShellLabels } from "./labels";
import type { AdminSearchEntry } from "./admin-search";

export type AdminShellBrand = {
  logo?: ReactNode;
  label?: string;
  href?: string;
  accent?: string;
};

export type AdminShellContextValue = {
  nav: AdminNavGroup[];
  session: AdminSession | null;
  labels: AdminShellLabels;
  collapsed: boolean;
  expandSidebar: () => void;
  homeHref: string;
  profileHref: string;
  viewSiteHref: string;
  onLogout?: () => void;
  searchEntries?: AdminSearchEntry[];
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell(): AdminShellContextValue | null {
  return useContext(AdminShellContext);
}

export const AdminShellProvider = AdminShellContext.Provider;
