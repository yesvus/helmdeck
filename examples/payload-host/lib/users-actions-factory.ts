// SPDX-License-Identifier: MIT

import { revalidatePath } from "next/cache";
import { principal, isAdmin } from "./rules";
import { assertNotLastAdmin } from "./payload/users-guard";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type UserAccount = {
  id: string;
  email: string;
  role: string;
  loginAttempts?: number;
  lockUntil?: string | null;
};

type SessionLike = { id?: string | number; email?: string; role?: unknown } | null;

export type UsersActionsDependencies = {
  sessionResolver?: () => Promise<SessionLike>;
  readSession?: () => Promise<SessionLike>;
  payload?: {
    find: (args: { collection: string; [key: string]: unknown }) => Promise<unknown>;
    findByID: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
    create: (args: { collection: string; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    update: (args: { collection: string; id: string | number; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    delete: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
    count?: (args: { collection: string; [key: string]: unknown }) => Promise<unknown>;
    unlock?: (args: { collection: string; data: { email: string }; [key: string]: unknown }) => Promise<unknown>;
  };
  countAdmins?: () => Promise<number> | number;
};

function getSessionResolver(deps: UsersActionsDependencies): () => Promise<SessionLike> {
  return deps.sessionResolver ?? deps.readSession ?? (async () => null);
}

function readDocs(result: unknown): UserAccount[] {
  const docs = (result && typeof result === "object" ? (result as { docs?: unknown }).docs : null) ?? [];
  if (!Array.isArray(docs)) return [];
  return docs.map((doc) => {
    const row = (doc ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      email: typeof row.email === "string" ? row.email : "",
      role: typeof row.role === "string" ? row.role : "",
      ...(typeof row.loginAttempts === "number" ? { loginAttempts: row.loginAttempts } : {}),
      ...(row.lockUntil === null || typeof row.lockUntil === "string" ? { lockUntil: row.lockUntil as string | null } : {}),
    };
  });
}

export function createUserActions(deps: UsersActionsDependencies = {}) {
  const sessionResolver = getSessionResolver(deps);

  async function currentAdmin(): Promise<SessionLike> {
    const session = await sessionResolver();
    const user = principal(session);
    if (!isAdmin(user)) return null;
    return session;
  }

  async function listUsers(): Promise<UserAccount[]> {
    const admin = await currentAdmin();
    if (!admin) throw new Error("Not authorized");
    const payload = deps.payload;
    if (!payload) return [];
    const result = await payload.find({ collection: "users", overrideAccess: false, user: admin as never, limit: 100, depth: 0 });
    return readDocs(result);
  }

  function normalizeCreateInput(input: unknown, role?: string, password?: string) {
    if (typeof input === "string") {
      return { email: input, role: role ?? "editor", password };
    }
    const obj = (input ?? {}) as Record<string, unknown>;
    return {
      email: typeof obj.email === "string" ? obj.email : "",
      role: typeof obj.role === "string" ? obj.role : (role ?? "editor"),
      password: typeof obj.password === "string" ? obj.password : password,
    };
  }

  async function createUser(input: unknown, role?: string, password?: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      const { email, role: userRole, password: userPassword } = normalizeCreateInput(input, role, password);
      if (!email) return { ok: false, error: "Email is required" };
      const finalPassword = userPassword && userPassword.length > 0 ? userPassword : crypto.randomUUID();
      await payload.create({
        collection: "users",
        data: { email, password: finalPassword, role: userRole },
        overrideAccess: false,
        user: admin as never,
      });
      try { revalidatePath("/admin/users"); } catch { void 0; }
      return { ok: true };
    } catch {
      void 0;
      return { ok: false, error: "Could not create this user" };
    }
  }

  async function changeRole(input: unknown, role?: string): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      const id = typeof input === "string" ? input : String((input as { id?: unknown })?.id ?? "");
      const newRole = typeof input === "object" && input !== null && "role" in (input as object)
        ? String((input as { role?: unknown }).role ?? role ?? "")
        : (role ?? "");
      if (!id || !newRole) return { ok: false, error: "Invalid request" };
      const adminUser = principal(admin);
      const currentUserId = adminUser?.id ?? null;
      const countAdmins = deps.countAdmins ?? (async () => {
        if (payload.count) {
          const res = await payload.count({ collection: "users", where: { role: { equals: "admin" } } });
          return typeof (res as { totalDocs?: unknown })?.totalDocs === "number" ? (res as { totalDocs: number }).totalDocs : 0;
        }
        return 0;
      });
      const guard = await assertNotLastAdmin("update", id, currentUserId, { countAdmins, nextRole: newRole, targetIsAdmin: true });
      if (!guard.ok) return guard;
      await payload.update({
        collection: "users",
        id,
        data: { role: newRole },
        overrideAccess: false,
        user: admin as never,
      });
      try { revalidatePath("/admin/users"); } catch { void 0; }
      return { ok: true };
    } catch {
      void 0;
      return { ok: false, error: "Could not change this user's role" };
    }
  }

  async function unlockUser(input: unknown): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      const id = typeof input === "string" ? input : String((input as { id?: unknown })?.id ?? "");
      if (!id) return { ok: false, error: "Invalid request" };
      // Prefer Payload's own unlock operation when the injected payload supports it.
      if (typeof payload.unlock === "function") {
        const doc = await payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true });
        const email = typeof (doc as { email?: unknown })?.email === "string" ? (doc as { email: string }).email : "";
        if (email) {
          await payload.unlock({ collection: "users", data: { email }, overrideAccess: true });
        }
      }
      await payload.update({
        collection: "users",
        id,
        data: { loginAttempts: 0, lockUntil: null },
        overrideAccess: true,
        user: admin as never,
      });
      try { revalidatePath("/admin/users"); } catch { void 0; }
      return { ok: true };
    } catch {
      void 0;
      return { ok: false, error: "Could not unlock this account" };
    }
  }

  async function deleteUser(input: unknown): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      const id = typeof input === "string" ? input : String((input as { id?: unknown })?.id ?? "");
      if (!id) return { ok: false, error: "Invalid request" };
      const adminUser = principal(admin);
      const currentUserId = adminUser?.id ?? null;
      if (String(id) === String(currentUserId)) {
        return { ok: false, error: "Cannot delete your own account" };
      }
      const countAdmins = deps.countAdmins ?? (async () => {
        if (payload.count) {
          const res = await payload.count({ collection: "users", where: { role: { equals: "admin" } } });
          return typeof (res as { totalDocs?: unknown })?.totalDocs === "number" ? (res as { totalDocs: number }).totalDocs : 0;
        }
        return 0;
      });
      // Determine if target is admin.
      let targetIsAdmin = true;
      try {
        const doc = await payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true });
        targetIsAdmin = (doc as { role?: unknown })?.role === "admin";
      } catch {
        targetIsAdmin = true;
      }
      const guard = await assertNotLastAdmin("delete", id, currentUserId, { countAdmins, targetIsAdmin });
      if (!guard.ok) return guard;
      await payload.delete({ collection: "users", id, overrideAccess: false, user: admin as never });
      try { revalidatePath("/admin/users"); } catch { void 0; }
      return { ok: true };
    } catch {
      void 0;
      return { ok: false, error: "Could not delete this user" };
    }
  }

  return {
    listUsers,
    listAccounts: listUsers,
    getUsers: listUsers,
    createUser,
    addUser: createUser,
    inviteUser: createUser,
    changeRole,
    changeUserRole: changeRole,
    updateUserRole: changeRole,
    setRole: changeRole,
    setRoleForUser: changeRole,
    unlockUser,
    unlockAccount: unlockUser,
    unlock: unlockUser,
    clearLock: unlockUser,
    deleteUser,
    removeUser: deleteUser,
    deleteAccount: deleteUser,
  };
}

// Alias factory names.
export const createUsersActions = createUserActions;
export const createUserManagement = createUserActions;
export const createUsersManagement = createUserActions;
export const createUsers = createUserActions;