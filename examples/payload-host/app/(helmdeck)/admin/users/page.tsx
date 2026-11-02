// SPDX-License-Identifier: MIT
import { AdminPageHeader } from "@yesvus/helmdeck";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/guard";
import { principal, isAdmin } from "@/lib/rules";
import { listUsers } from "@/lib/users-actions";
import { UsersTable } from "@/components/users-table";

export default async function UsersPage() {
  const session = await requireAdminSession({ returnTo: "/admin/users" });
  if (!isAdmin(principal(session))) redirect("/admin");
  const users = await listUsers();
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Users" />
      <p className="max-w-prose text-sm text-zinc-600">
        Accounts in Payload&apos;s <code>users</code> collection. Administrators only.
      </p>
      <UsersTable users={users} />
    </div>
  );
}
