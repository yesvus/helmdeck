// SPDX-License-Identifier: MIT

import { revalidatePath } from "next/cache";
import { principal, isAdmin } from "./rules";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
};

export type InboxActionsDependencies = {
  sessionResolver?: () => Promise<unknown>;
  readSession?: () => Promise<unknown>;
  payload?: {
    find: (args: { collection: string; [key: string]: unknown }) => Promise<unknown>;
    findByID: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
    create: (args: { collection: string; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    update: (args: { collection: string; id: string | number; data: unknown; [key: string]: unknown }) => Promise<unknown>;
    delete: (args: { collection: string; id: string | number; [key: string]: unknown }) => Promise<unknown>;
  };
};

function getSessionResolver(deps: InboxActionsDependencies): () => Promise<unknown> {
  return deps.sessionResolver ?? deps.readSession ?? (async () => null);
}

function readDocs(result: unknown): ContactMessage[] {
  const docs = (result && typeof result === "object" ? (result as { docs?: unknown }).docs : null) ?? [];
  if (!Array.isArray(docs)) return [];
  return docs.map((doc) => {
    const row = (doc ?? {}) as Record<string, unknown>;
    const status = row.status === "read" || row.status === "archived" ? (row.status as "read" | "archived") : "new";
    return {
      id: String(row.id ?? ""),
      name: typeof row.name === "string" ? row.name : "",
      email: typeof row.email === "string" ? row.email : "",
      subject: typeof row.subject === "string" ? row.subject : "",
      message: typeof row.message === "string" ? row.message : "",
      status,
      created_at: typeof row.created_at === "string" ? row.created_at : (typeof row.receivedAt === "string" ? row.receivedAt : new Date().toISOString()),
    };
  });
}

export function createInboxActions(deps: InboxActionsDependencies = {}) {
  const sessionResolver = getSessionResolver(deps);

  async function currentAdmin(): Promise<unknown> {
    const session = await sessionResolver();
    const user = principal(session as never);
    if (!isAdmin(user)) return null;
    return session;
  }

  async function listMessages(): Promise<ContactMessage[]> {
    const admin = await currentAdmin();
    if (!admin) throw new Error("Not authorized");
    const payload = deps.payload;
    if (!payload) return [];
    const result = await payload.find({ collection: "contact-messages", overrideAccess: false, user: admin as never, limit: 100, sort: "-created_at", depth: 0 });
    return readDocs(result);
  }

  async function readMessage(id: string): Promise<ContactMessage | null> {
    const admin = await currentAdmin();
    if (!admin) throw new Error("Not authorized");
    const payload = deps.payload;
    if (!payload) return null;
    const doc = await payload.findByID({ collection: "contact-messages", id, overrideAccess: false, user: admin as never, depth: 0 });
    const rows = readDocs({ docs: [doc] });
    return rows[0] ?? null;
  }

  async function createMessage(input: unknown): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      const obj = (input ?? {}) as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : "";
      const email = typeof obj.email === "string" ? obj.email : "";
      const subject = typeof obj.subject === "string" ? obj.subject : "";
      const message = typeof obj.message === "string" ? obj.message : "";
      if (!name || !email || !subject || !message) return { ok: false, error: "Invalid request" };
      await payload.create({
        collection: "contact-messages",
        data: { name, email, subject, message, created_at: new Date().toISOString(), status: "new" },
        overrideAccess: false,
        user: admin as never,
      });
      try { revalidatePath("/admin/inbox"); } catch { void 0; }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not create this message" };
    }
  }

  async function updateStatus(id: string, status: "new" | "read" | "archived"): Promise<ActionResult> {
    try {
      const admin = await currentAdmin();
      if (!admin) return { ok: false, error: "Not authorized" };
      const payload = deps.payload;
      if (!payload) return { ok: false, error: "Not available" };
      if (!id || !status) return { ok: false, error: "Invalid request" };
      await payload.update({
        collection: "contact-messages",
        id,
        data: { status },
        overrideAccess: false,
        user: admin as never,
      });
      try { revalidatePath("/admin/inbox"); } catch { void 0; }
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not update this message" };
    }
  }

  async function markRead(id: unknown): Promise<ActionResult> {
    const target = typeof id === "string" ? id : String((id as { id?: unknown })?.id ?? id ?? "");
    return updateStatus(target, "read");
  }

  async function archiveMessage(id: unknown): Promise<ActionResult> {
    const target = typeof id === "string" ? id : String((id as { id?: unknown })?.id ?? id ?? "");
    return updateStatus(target, "archived");
  }

  async function markArchived(id: unknown): Promise<ActionResult> {
    return archiveMessage(id);
  }

  return {
    listMessages,
    listInbox: listMessages,
    listContactMessages: listMessages,
    getMessages: listMessages,
    readMessage,
    getMessage: readMessage,
    createMessage,
    submitMessage: createMessage,
    createContactMessage: createMessage,
    addMessage: createMessage,
    updateStatus,
    setStatus: updateStatus,
    updateMessageStatus: updateStatus,
    markRead,
    markMessageRead: markRead,
    markAsRead: markRead,
    archiveMessage,
    archive: archiveMessage,
    archiveContactMessage: archiveMessage,
    markArchived,
  };
}

// Aliases.
export const createContactActions = createInboxActions;
export const createContactMessageActions = createInboxActions;
export const createMessageActions = createInboxActions;
export const createInboxManagement = createInboxActions;
