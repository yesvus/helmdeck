import type { ReactNode } from "react";
import { AdminShell } from "@yesvus/helmdeck";
import { commerceNav } from "@/lib/commerce-nav";
import { currentAdminSession } from "@/lib/session";

export default async function HelmdeckLayout({ children }: { children: ReactNode }) {
  const session = await currentAdminSession();

  return (
    <AdminShell
      nav={commerceNav(Boolean(process.env.MEDUSA_API_URL))}
      session={session}
      homeHref="/"
      brand={{ label: "Helmdeck", href: "/" }}
    >
      <div className="p-6 lg:p-10">{children}</div>
    </AdminShell>
  );
}
