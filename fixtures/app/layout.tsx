import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DemoI18nProvider } from "../components/demo-i18n-provider";

export const metadata: Metadata = {
  title: {
    default: "Helmdeck",
    template: "%s | Helmdeck",
  },
  description: "Reusable admin infrastructure for Next.js products.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-zinc-50 text-zinc-900 antialiased">
        <DemoI18nProvider>{children}</DemoI18nProvider>
      </body>
    </html>
  );
}
