"use client";

import type { ReactNode } from "react";
import { AdminShell, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";
import {
  ContentLocaleSwitcher,
  LocaleAdapterProvider,
} from "../../components/locale-adapter-provider";

const nav: AdminNavGroup[] = [
  {
    label: "İçerik",
    items: [
      { href: "/locale", label: "Genel bakış" },
      { href: "/locale/urunler", label: "Ürünler" },
    ],
  },
  {
    label: "Ayarlar",
    items: [{ href: "/locale/ayarlar", label: "Site ayarları", roles: ["owner"] }],
  },
];

const session: AdminSession = { name: "Deniz Aydın", email: "deniz@example.com", role: "owner" };

export default function LocaleLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleAdapterProvider>
      <AdminShell
        nav={nav}
        session={session}
        homeHref="/locale"
        showTopbar
        topbarExtra={<ContentLocaleSwitcher />}
      >
        {children}
      </AdminShell>
    </LocaleAdapterProvider>
  );
}
