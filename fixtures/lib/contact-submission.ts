// SPDX-License-Identifier: MIT

import type { AdminContactSubmission, AdminPersistenceAdapter } from "@yesvus/helmdeck";

const LIMITS = { name: 120, email: 254, subject: 160, message: 10_000 } as const;

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

export function parseContactSubmission(value: unknown): AdminContactSubmission | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = boundedText(record.name, LIMITS.name);
  const email = boundedText(record.email, LIMITS.email);
  const subject = boundedText(record.subject, LIMITS.subject);
  const message = boundedText(record.message, LIMITS.message);
  if (!name || !email || !subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { name, email, subject, message };
}

export async function persistContactSubmission(
  persistence: Pick<AdminPersistenceAdapter, "create">,
  value: unknown,
  createdAt = new Date().toISOString(),
): Promise<void> {
  const submission = parseContactSubmission(value);
  if (!submission) throw new Error("The contact message is invalid");
  await persistence.create("contact_messages", {
    ...submission,
    status: "new",
    created_at: createdAt,
  });
}
