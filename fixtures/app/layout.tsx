import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "helmdeck fixtures",
  description: "Manual check pages for the helmdeck admin shell",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
