// SPDX-License-Identifier: MIT
"use server";

import { revalidatePath } from "next/cache";
import type { AdminResourcePage, AdminResourceQuery } from "@yesvus/helmdeck";
import { CONTACT_INBOX_PAGE_SIZE } from "../../../../lib/contact-inbox-view";
import { queryPageAction, readResourceAction, updateResourceAction } from "../../../../lib/resource-actions";

function validateId(id: string) {
  if (typeof id !== "string" || id.length === 0 || id.length > 256) throw new Error("The message id is invalid");
}

export async function queryMessages(page: number): Promise<AdminResourcePage<unknown>> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error("The page is invalid");
  const query: AdminResourceQuery = {
    sort: [{ field: "created_at", direction: "desc" }],
    window: { offset: (page - 1) * CONTACT_INBOX_PAGE_SIZE, limit: CONTACT_INBOX_PAGE_SIZE },
  };
  return queryPageAction("contact_messages", query);
}

export async function readMessage(id: string): Promise<unknown | null> {
  validateId(id);
  return readResourceAction("contact_messages", id);
}

export async function markMessageRead(id: string): Promise<void> {
  validateId(id);
  await updateResourceAction("contact_messages", id, { status: "read" });
  revalidatePath("/shell/messages");
  revalidatePath(`/shell/messages/${encodeURIComponent(id)}`);
}

export async function archiveMessage(id: string): Promise<void> {
  validateId(id);
  await updateResourceAction("contact_messages", id, { status: "archived" });
  revalidatePath("/shell/messages");
  revalidatePath(`/shell/messages/${encodeURIComponent(id)}`);
}
