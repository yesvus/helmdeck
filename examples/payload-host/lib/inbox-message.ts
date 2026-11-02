// SPDX-License-Identifier: MIT
/**
 * Pure mapping from a contact message record to the admin inbox view model.
 */

import type { AdminInboxMessageData } from "@yesvus/helmdeck";

export function contactInboxMessage(value: unknown): AdminInboxMessageData | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as {
    id?: unknown;
    name?: unknown;
    email?: unknown;
    subject?: unknown;
    message?: unknown;
    status?: unknown;
    created_at?: unknown;
  };
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