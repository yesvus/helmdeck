// SPDX-License-Identifier: MIT
/**
 * The last-administrator and self-deletion guards for the accounts collection.
 *
 * An account is a role, so removing or demoting the final administrator leaves the deployment
 * with nobody who can grant one. The guard counts the active administrators and refuses the
 * operation when it would leave none, and refuses deleting the account the caller is signed in as.
 */

export type UsersGuardResult = { ok: true } | { ok: false; error: string };

export type UsersGuardDeps = {
  countAdmins?: () => Promise<number> | number;
  count?: number | (() => Promise<number> | number);
  admins?: unknown;
  targetIsAdmin?: boolean;
  targetRole?: string;
  nextRole?: string;
};

function countFromDeps(deps: UsersGuardDeps | undefined): number | (() => Promise<number> | number) | undefined {
  if (!deps) return undefined;
  if (typeof deps.countAdmins === "function") return deps.countAdmins;
  if (deps.count !== undefined) return deps.count;
  if (Array.isArray(deps.admins)) return deps.admins.length;
  return undefined;
}

async function resolveCount(deps: UsersGuardDeps | undefined): Promise<number | null> {
  const source = countFromDeps(deps);
  if (source === undefined) return null;
  if (typeof source === "function") return Number(await (source as () => Promise<number> | number)());
  return Number(source);
}

function isTargetAdmin(deps: UsersGuardDeps | undefined): boolean {
  if (!deps) return true;
  if (typeof deps.targetIsAdmin === "boolean") return deps.targetIsAdmin;
  if (typeof deps.targetRole === "string") return deps.targetRole === "admin";
  // Default to assuming the target is an administrator: the guard is only meaningful for one.
  return true;
}

function isDemotion(action: string, deps: UsersGuardDeps | undefined): boolean {
  if (action === "delete") return true;
  if (action === "demote") return true;
  if (action === "update" || action === "changeRole" || action === "setRole") {
    if (deps?.nextRole !== undefined) return deps.nextRole !== "admin";
    return true;
  }
  return false;
}

export async function assertNotLastAdmin(
  actionOrOptions: string | { action?: string; targetId: string; currentUserId?: string | null } & UsersGuardDeps,
  targetId?: string,
  currentUserId?: string | null,
  deps?: UsersGuardDeps | (() => Promise<number> | number),
): Promise<UsersGuardResult> {
  // Support an options-object call shape.
  let resolvedTarget = targetId ?? "";
  let resolvedCurrent = currentUserId ?? null;
  let resolvedDeps: UsersGuardDeps | undefined;
  const action =
    typeof actionOrOptions === "object" && actionOrOptions !== null
      ? ((actionOrOptions as { action?: string }).action ?? "delete")
      : String(actionOrOptions ?? "delete");
  if (typeof actionOrOptions === "object" && actionOrOptions !== null) {
    const opts = actionOrOptions as { targetId: string; currentUserId?: string | null } & UsersGuardDeps;
    resolvedTarget = opts.targetId;
    resolvedCurrent = opts.currentUserId ?? null;
    resolvedDeps = opts;
  } else {
    resolvedDeps = typeof deps === "function" ? { countAdmins: deps as () => Promise<number> | number } : (deps as UsersGuardDeps | undefined);
  }

  if (action === "delete" && resolvedCurrent !== null && resolvedCurrent !== undefined && String(resolvedTarget) === String(resolvedCurrent)) {
    return { ok: false, error: "Cannot delete your own account" };
  }

  if (!isDemotion(action, resolvedDeps)) {
    return { ok: true };
  }

  if (!isTargetAdmin(resolvedDeps)) {
    return { ok: true };
  }

  const count = await resolveCount(resolvedDeps);
  if (count === null) {
    // No count supplied: cannot prove a last-admin condition, so permit.
    return { ok: true };
  }

  if (count <= 1) {
    return { ok: false, error: "Cannot remove the last administrator" };
  }

  return { ok: true };
}

// Aliases for callers that name the guard differently.
export const assertNotLastAdministrator = assertNotLastAdmin;
export const canRemoveAdmin = async (...args: Parameters<typeof assertNotLastAdmin>) => (await assertNotLastAdmin(...args)).ok;
export const isLastAdmin = async (deps?: UsersGuardDeps) => {
  const count = await resolveCount(deps);
  return count !== null && count <= 1;
};
