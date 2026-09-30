import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminI18nProvider } from "@yesvus/helmdeck";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = { title: APP_NAME };

/**
 * The English dictionary, once, for the whole app.
 *
 * `AdminI18nProvider` defaults to Turkish, so a host that wants English says so here rather than
 * wrapping each surface. Replace the value, or register a dictionary of your own, in
 * `defineAdminMessages`; interface copy is the package's and content copy is yours.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminI18nProvider locale="en">{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
