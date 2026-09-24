"use client";

import type { ReactNode } from "react";
import {
  AdminI18nProvider,
  defineAdminMessages,
  englishAdminMessages,
  type AdminMessages,
} from "@yesvus/helmdeck";

const customMessages: AdminMessages = {
  ...englishAdminMessages,
  locale: "de",
  searchLocale: "de-DE",
  shell: {
    ...englishAdminMessages.shell,
    searchLabel: "Administrationsseiten durchsuchen",
  },
};

defineAdminMessages(customMessages);

export function CustomLocaleProvider({ children }: { children: ReactNode }) {
  return <AdminI18nProvider locale="de">{children}</AdminI18nProvider>;
}
