import type { ReactNode } from "react";
import { adminLoginHref, type AdminNavGroup } from "@yesvus/helmdeck";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import { AdminWorkspace } from "@/components/admin-workspace";
import { ADMIN_REQUEST_PATH_HEADER } from "@/host/request-path";
import { getHostSession } from "@/host/session";

const nav: AdminNavGroup[] = [{
  label: "Workspace",
  items: [
    { href: "/admin", label: "Overview", icon: "overview" },
    { href: "/admin/dashboard", label: "Dashboard", icon: "chart" },
    { href: "/admin/projects", label: "Projects", icon: "product" },
    { href: "/admin/orders", label: "Orders", icon: "store" },
    { href: "/admin/blocks", label: "Content blocks", icon: "article" },
  ],
}];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getHostSession();
  if (!session) {
    const destination = (await headers()).get(ADMIN_REQUEST_PATH_HEADER) ?? "/admin";
    redirect(adminLoginHref("/login", destination));
  }

  return <AdminWorkspace nav={nav}>
    <div className="p-6 lg:p-10">
      {children}
    </div>
  </AdminWorkspace>;
}
