// SPDX-License-Identifier: MIT
"use server";

import { createUserActions, type UserAccount, type ActionResult, type UsersActionsDependencies } from "./users-actions-factory";

export type { ActionResult, UserAccount, UsersActionsDependencies } from "./users-actions-factory";

// Default instance for direct server-action use.
let defaultActions: ReturnType<typeof createUserActions> | null = null;
async function getDefaultActions() {
  if (defaultActions) return defaultActions;
  const { readPayloadSession } = await import("./session");
  const { payloadInstance } = await import("./payload/content");
  const payload = await payloadInstance();
  defaultActions = createUserActions({
    sessionResolver: readPayloadSession as unknown as UsersActionsDependencies["sessionResolver"],
    payload: payload as unknown as UsersActionsDependencies["payload"],
  });
  return defaultActions;
}

export async function listUsers(): Promise<UserAccount[]> {
  return (await getDefaultActions()).listUsers();
}
export async function listAccounts(): Promise<UserAccount[]> {
  return (await getDefaultActions()).listUsers();
}
export async function createUser(input: unknown, role?: string, password?: string): Promise<ActionResult> {
  return (await getDefaultActions()).createUser(input, role, password);
}
export async function changeUserRole(first: unknown, second?: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).changeRole(first, second as string | undefined);
}
export async function updateUserRole(first: unknown, second?: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).changeRole(first, second as string | undefined);
}
export async function setRole(first: unknown, second?: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).changeRole(first, second as string | undefined);
}
export async function unlockUser(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).unlockUser(input);
}
export async function unlockAccount(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).unlockUser(input);
}
export async function unlock(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).unlockUser(input);
}
export async function deleteUser(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).deleteUser(input);
}
export async function removeUser(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).deleteUser(input);
}
export async function deleteAccount(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).deleteUser(input);
}