import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { getHostSession, logout } from "@/host/session";
import { AdminWorkspace } from "@/components/admin-workspace";

const nav: AdminNavGroup[] = [{
  label: "Workspace",
  items: [{ href: "/admin", label: "Overview", icon: "overview" }],
}];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getHostSession();
  if (!session) return <main className="p-8">No host session is active.</main>;

  return <AdminWorkspace nav={nav} session={session} onLogout={logout}>
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex gap-4 text-sm"><Link href="/admin">Overview</Link></div>
      {children}
    </div>
  </AdminWorkspace>;
}
