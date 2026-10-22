import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ADMIN_THEME_BOOT_SCRIPT, AdminI18nProvider, AdminThemeProvider } from "@yesvus/helmdeck";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = { title: APP_NAME };

/**
 * The English dictionary, once, for the whole shell.
 *
 * `AdminI18nProvider` defaults to Turkish, so a host that wants English says so here rather than
 * wrapping each surface. Replace the value, or register a dictionary of your own, in
 * `defineAdminMessages`; interface copy is the package's and content copy is yours.
 *
 * This is the shell's own document. Payload's panel renders its own `html` tag, so it lives in a
 * route group beside this one rather than under it: two documents, one session.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script writes an attribute onto <html> before React hydrates, so the server and
    // client markup are expected to differ here.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh] bg-zinc-50 text-zinc-900 antialiased">
        <AdminThemeProvider>
          <AdminI18nProvider locale="en">{children}</AdminI18nProvider>
        </AdminThemeProvider>
      </body>
    </html>
  );
}
