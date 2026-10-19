import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ADMIN_THEME_BOOT_SCRIPT, AdminThemeProvider } from "@yesvus/helmdeck";
import "./globals.css";

export const metadata: Metadata = { title: "Independent Helmdeck host" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_BOOT_SCRIPT }} /></head>
      <body><AdminThemeProvider>{children}</AdminThemeProvider></body>
    </html>
  );
}
