// SPDX-License-Identifier: MIT
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultAdminLocale, getAdminMessages, type AdminMessages } from "./messages.js";

const AdminI18nContext = createContext<AdminMessages>(getAdminMessages(defaultAdminLocale));

export function AdminI18nProvider({
  children,
  locale = defaultAdminLocale,
  messages,
}: {
  children: ReactNode;
  locale?: string;
  messages?: AdminMessages;
}) {
  return (
    <AdminI18nContext.Provider value={messages ?? getAdminMessages(locale)}>
      {children}
    </AdminI18nContext.Provider>
  );
}

export function useAdminMessages() {
  return useContext(AdminI18nContext);
}
