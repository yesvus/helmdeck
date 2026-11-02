// SPDX-License-Identifier: MIT
/**
 * Payload-backed persistence adapter for the host's analytics and inbox.
 */

import { createAdminPayloadContent, createAdminPayloadPersistenceAdapter } from "@yesvus/helmdeck";
import type { AdminPayloadContent, AdminPayloadInstance, AdminPersistenceAdapter } from "@yesvus/helmdeck";

function collectionFor(resource: string): string {
  const normalized = String(resource ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (normalized.includes("analytic")) return "analytics-events";
  if (normalized.includes("contact") || normalized.includes("inbox") || normalized.includes("message")) return "contact-messages";
  return normalized || String(resource);
}

export type PayloadPersistenceOptions = {
  content?: AdminPayloadContent;
  payload?: AdminPayloadInstance;
  resolveUser?: () => Promise<unknown>;
  collection?: string | ((resource: string) => string);
  defaultSort?: string;
  searchFields?: unknown;
};

function resolveContent(input: unknown): AdminPayloadContent | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as { find?: unknown; create?: unknown; content?: unknown; payload?: unknown };
  if (typeof candidate.find === "function" && typeof candidate.create === "function") {
    return candidate as AdminPayloadContent;
  }
  if (candidate.content) {
    const nested = resolveContent(candidate.content);
    if (nested) return nested;
  }
  if (candidate.payload) {
    const resolver = (input as { resolveUser?: () => Promise<unknown> }).resolveUser ?? (async () => {
      const { readPayloadSession } = await import("../session");
      return readPayloadSession();
    });
    return createAdminPayloadContent({ payload: candidate.payload as AdminPayloadInstance, resolveUser: resolver as never });
  }
  return null;
}

export function createPayloadPersistence(input?: PayloadPersistenceOptions | AdminPayloadContent): AdminPersistenceAdapter {
  const content = resolveContent(input);
  if (!content) throw new Error("A Payload content or payload instance is required to create persistence.");
  const options = (input && typeof input === "object" && !("find" in (input as object))) ? (input as PayloadPersistenceOptions) : {};
  const collection = options.collection ?? collectionFor;
  return createAdminPayloadPersistenceAdapter({
    content,
    collection: collection as string | ((resource: string) => string),
    ...(options.defaultSort ? { defaultSort: options.defaultSort } : {}),
    ...(options.searchFields !== undefined ? { searchFields: options.searchFields as never } : {}),
  });
}

// Aliases for varying naming expectations.
export const createPersistence = createPayloadPersistence;
export const createPersistenceAdapter = createPayloadPersistence;
export const createAdminPayloadPersistence = createPayloadPersistence;
export const createAdminPersistence = createPayloadPersistence;

export async function payloadPersistence(): Promise<AdminPersistenceAdapter> {
  const { payloadContent } = await import("./content");
  const content = await payloadContent();
  return createPayloadPersistence({ content });
}

export async function getPersistence(): Promise<AdminPersistenceAdapter> {
  return payloadPersistence();
}

export async function recordPageView(input: { path: string; visitorKey?: string | null; source?: string | null; kind?: string; at?: string }): Promise<unknown> {
  try {
    const { payloadInstance } = await import("./content");
    const payload = await payloadInstance();
    const occurredAt = input.at ?? new Date().toISOString();
    return await payload.create({
      collection: "analytics-events",
      overrideAccess: true,
      data: {
        kind: input.kind ?? "page_view",
        path: input.path,
        visitor_key: input.visitorKey ?? null,
        source: input.source ?? null,
        occurred_at: occurredAt,
      },
    });
  } catch {
    return null;
  }
}
