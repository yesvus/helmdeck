// SPDX-License-Identifier: MIT

import type { AdminContactSubmission, AdminPersistenceAdapter } from "@yesvus/helmdeck";

const LIMITS = { name: 120, email: 254, subject: 160, message: 10_000 } as const;

export function createContactSubmissionThrottle({
  limit = 10,
  windowMs = 60_000,
  now = Date.now,
}: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
} = {}): () => void {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error("windowMs must be a positive integer");
  let windowStartedAt = now();
  let count = 0;

  return () => {
    const current = now();
    if (current - windowStartedAt >= windowMs) {
      windowStartedAt = current;
      count = 0;
    }
    if (count >= limit) throw new Error("Too many contact messages. Please try again later.");
    count += 1;
  };
}

export const allowContactSubmission = createContactSubmissionThrottle();

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
