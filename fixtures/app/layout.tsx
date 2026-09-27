import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DemoI18nProvider } from "../components/demo-i18n-provider";
import { ShellThemeProvider } from "../components/shell-theme-provider";
import { themeBootScript } from "../components/theme-boot";

export const metadata: Metadata = {
  title: {
    default: "Helmdeck",
    template: "%s | Helmdeck",
  },
  description: "Reusable admin infrastructure for Next.js products.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script writes an attribute onto <html> before React hydrates, so the server and
    // client markup are expected to differ here.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-[100dvh] bg-zinc-50 text-zinc-900 antialiased">
        {/* The provider lives here rather than in the shell layout, so the landing page resolves
            the same stored preference instead of falling back to the light default. */}
        <ShellThemeProvider>
          <DemoI18nProvider>{children}</DemoI18nProvider>
        </ShellThemeProvider>
      </body>
    </html>
  );
}
