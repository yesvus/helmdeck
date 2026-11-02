// SPDX-License-Identifier: MIT
"use server";

import { createInboxActions, type ContactMessage, type ActionResult, type InboxActionsDependencies } from "./inbox-actions-factory";

export type { ActionResult, ContactMessage, InboxActionsDependencies } from "./inbox-actions-factory";

let defaultActions: ReturnType<typeof createInboxActions> | null = null;
async function getDefaultActions() {
  if (defaultActions) return defaultActions;
  const { readPayloadSession } = await import("./session");
  const { payloadInstance } = await import("./payload/content");
  const payload = await payloadInstance();
  defaultActions = createInboxActions({
    sessionResolver: readPayloadSession as unknown as InboxActionsDependencies["sessionResolver"],
    payload: payload as unknown as InboxActionsDependencies["payload"],
  });
  return defaultActions;
}

export async function listMessages(): Promise<ContactMessage[]> {
  return (await getDefaultActions()).listMessages();
}
export async function listInbox(): Promise<ContactMessage[]> {
  return (await getDefaultActions()).listMessages();
}
export async function listContactMessages(): Promise<ContactMessage[]> {
  return (await getDefaultActions()).listMessages();
}
export async function readMessage(id: string): Promise<ContactMessage | null> {
  return (await getDefaultActions()).readMessage(id);
}
export async function createMessage(input: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).createMessage(input);
}
export async function updateStatus(id: string, status: "new" | "read" | "archived"): Promise<ActionResult> {
  return (await getDefaultActions()).updateStatus(id, status);
}
export async function markRead(id: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).markRead(id);
}
export async function archiveMessage(id: unknown): Promise<ActionResult> {
  return (await getDefaultActions()).archiveMessage(id);
}
