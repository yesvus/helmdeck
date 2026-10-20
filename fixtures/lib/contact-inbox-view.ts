// SPDX-License-Identifier: MIT

import type { AdminInboxItem, AdminInboxMessageData } from "@yesvus/helmdeck";

export const CONTACT_INBOX_PAGE_SIZE = 10;

type ContactMessageRecord = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

export function contactInboxMessage(value: unknown): AdminInboxMessageData | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<ContactMessageRecord>;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.email !== "string" ||
    typeof row.subject !== "string" ||
    typeof row.message !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.status !== "string"
  ) return null;
  const status = row.status === "new"
    ? "unread"
    : row.status === "read" || row.status === "handled"
      ? "read"
      : row.status === "archived"
        ? "archived"
        : null;
  if (status === null) return null;
  return {
    id: row.id,
    sender: `${row.name} (${row.email})`,
    subject: row.subject,
    preview: row.message,
    body: row.message,
    receivedAt: row.created_at,
    status,
  };
}

export function contactInboxItem(value: unknown): AdminInboxItem | null {
  const message = contactInboxMessage(value);
  if (!message) return null;
  return {
    id: message.id,
    sender: message.sender,
    subject: message.subject,
    preview: message.preview,
    receivedAt: message.receivedAt,
    status: message.status,
  };
}
