import type { ReactNode } from "react";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { getHostSession } from "@/host/session";
import { AdminWorkspace } from "@/components/admin-workspace";

const nav: AdminNavGroup[] = [{
  label: "Workspace",
  items: [{ href: "/admin", label: "Overview", icon: "overview" }],
}];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getHostSession();
  if (!session) return <main className="p-8">No host session is active.</main>;

  return <AdminWorkspace nav={nav} session={session}>
    <div className="p-6 lg:p-10">
      {children}
    </div>
  </AdminWorkspace>;
}
