import type { ReactNode } from "react";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { redirect } from "next/navigation.js";
import { AdminWorkspace } from "@/components/admin-workspace";
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
  if (!session) redirect("/login?next=%2Fadmin");

  return <AdminWorkspace nav={nav}>
    <div className="p-6 lg:p-10">
      {children}
    </div>
  </AdminWorkspace>;
}
