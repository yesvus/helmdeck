"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Unlock } from "lucide-react";
import {
  AdminDataTable,
  AdminDestructiveAction,
  AdminDialogProvider,
  AdminEmptyState,
  AdminSectionCard,
  AdminStatusPill,
  AdminTableActionButton,
  AdminTableRowActions,
  useAdminDialog,
  type AdminDataTableColumn,
} from "@yesvus/helmdeck";
import { createUser, changeUserRole, unlockUser, deleteUser } from "@/lib/users-actions";

type User = {
  id: string;
  email: string;
  role: string;
  loginAttempts?: number;
  lockUntil?: string | null;
};

const ROLES = ["admin", "editor"];

function isLocked(user: User): boolean {
  if (user.lockUntil) {
    const until = new Date(user.lockUntil).getTime();
    if (Number.isFinite(until) && until > Date.now()) return true;
  }
  return (user.loginAttempts ?? 0) >= 10;
}

export function UsersTable({ users }: { users: User[] }) {
  const router = useRouter();
  const dialog = useAdminDialog();
  const rows = users;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  async function refresh() {
    router.refresh();
  }

  async function handleCreate() {
    setBusy("create");
    setError("");
    const result = await createUser({ email, password, role });
    if (!result.ok) setError(result.error);
    else {
      setEmail("");
      setPassword("");
      setRole("editor");
      await refresh();
    }
    setBusy("");
  }

  async function handleRoleChange(user: User) {
    const next = roleDrafts[user.id] ?? user.role;
    if (next === user.role) return;
    setBusy(`role:${user.id}`);
    setError("");
    const result = await changeUserRole(user.id, next);
    if (!result.ok) setError(result.error);
    else await refresh();
    setBusy("");
  }

  async function handleUnlock(user: User) {
    setBusy(`unlock:${user.id}`);
    setError("");
    const result = await unlockUser(user.id);
    if (!result.ok) setError(result.error);
    else await refresh();
    setBusy("");
  }

  async function handleDelete(user: User) {
    const confirmed = await dialog.confirm({
      title: "Delete user?",
      description: `Delete ${user.email}? This cannot be undone.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setBusy(`delete:${user.id}`);
    setError("");
    const result = await deleteUser(user.id);
    if (!result.ok) setError(result.error);
    else await refresh();
    setBusy("");
  }

  const columns: AdminDataTableColumn<User>[] = [
    { key: "email", header: "Email", cell: (row) => row.email, value: (row) => row.email, sortable: true },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-admin-border bg-white px-2 py-1 text-xs"
            value={roleDrafts[row.id] ?? row.role}
            onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <AdminTableActionButton
            label={busy === `role:${row.id}` ? "Saving…" : "Save"}
            icon={<Save className="h-4 w-4" />}
            onClick={() => void handleRoleChange(row)}
          />
        </div>
      ),
      value: (row) => row.role,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <AdminStatusPill tone={isLocked(row) ? "danger" : "success"} label={isLocked(row) ? "Locked" : "Active"} />
      ),
      value: (row) => (isLocked(row) ? "Locked" : "Active"),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <AdminTableRowActions label={`Actions for ${row.email}`}>
          {isLocked(row) ? (
            <AdminTableActionButton label={busy === `unlock:${row.id}` ? "Unlocking…" : "Unlock"} icon={<Unlock className="h-4 w-4" />} onClick={() => void handleUnlock(row)} />
          ) : null}
          <AdminDestructiveAction
            buttonText="Delete"
            triggerVariant="ghost"
            triggerAriaLabel={`Delete ${row.email}`}
            icon={<Trash2 className="h-4 w-4" />}
            title="Delete user?"
            description={`Delete ${row.email}? This cannot be undone.`}
            onConfirm={async () => {
              await handleDelete(row);
            }}
          />
        </AdminTableRowActions>
      ),
      value: () => "",
    },
  ];

  return (
    <AdminDialogProvider>
      <div className="space-y-6">
        <AdminSectionCard icon={Plus} title="Create account">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              Email
              <input className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-xs">
              Password
              <input type="password" className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="text-xs">
              Role
              <select className="ml-2 rounded border border-admin-border px-2 py-1 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy === "create"}
              onClick={() => void handleCreate()}
              className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {busy === "create" ? "Creating…" : "Create"}
            </button>
          </div>
        </AdminSectionCard>
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
        {rows.length === 0 ? (
          <AdminEmptyState title="No accounts" body="Create the first account above." />
        ) : (
          <AdminDataTable columns={columns} rows={rows} getKey={(row) => row.id} search searchLabel="Search users" searchPlaceholder="Email or role" empty={<AdminEmptyState title="Nothing to show" body="No accounts matched." />} />
        )}
      </div>
    </AdminDialogProvider>
  );
}
