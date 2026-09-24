// SPDX-License-Identifier: MIT
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AdminNavGroup, AdminSession } from "../adapters/index.js";
import type { AdminShellLabels } from "./labels.js";
import type { AdminSearchEntry } from "./admin-search.js";

export type AdminShellBrand = {
  logo?: ReactNode;
  label?: string;
  href?: string;
  accent?: string;
};

export type AdminShellContextValue = {
  nav: AdminNavGroup[];
  currentPageTitle?: string;
  session: AdminSession | null;
  labels: AdminShellLabels;
  collapsed: boolean;
  expandSidebar: () => void;
  homeHref: string;
  profileHref: string;
  viewSiteHref: string;
  onLogout?: () => void | Promise<void>;
  searchEntries?: AdminSearchEntry[];
  searchNormalize?: (value: string) => string;
  resolveBreadcrumbSegment?: (segment: string, labels: AdminShellLabels) => string;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell(): AdminShellContextValue | null {
  return useContext(AdminShellContext);
}

export const AdminShellProvider = AdminShellContext.Provider;
