// SPDX-License-Identifier: MIT

import type { AdminPayloadContent } from "./bridge.js";

export type AdminPayloadVersionDiffKind = "changed" | "added" | "removed";

export type AdminPayloadVersionDiffEntry = {
  field: string;
  before?: unknown;
  after?: unknown;
  kind: AdminPayloadVersionDiffKind;
};

export type AdminPayloadVersionRow = {
  id: string | number;
  versionAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  author: string | null;
  label: string | null;
  createdBy: unknown;
};

export type AdminPayloadVersionDocument = {
  id: string | number;
  [key: string]: unknown;
};

export type AdminPayloadVersionHistory = {
  list: (id: string | number, page?: number) => Promise<AdminPayloadVersionRow[]>;
  read: (id: string | number, versionId: string | number) => Promise<AdminPayloadVersionDocument>;
  diff: (before: unknown, after: unknown) => AdminPayloadVersionDiffEntry[];
  restore: (versionId: string | number, args?: Record<string, unknown>) => Promise<unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapVersion(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  const nested = (value as Record<string, unknown>).version;
  if (isPlainObject(nested)) return nested as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

function authorFrom(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.email === "string") return rec.email;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.id === "string" || typeof rec.id === "number") return String(rec.id);
  }
  return null;
}

function labelFrom(version: Record<string, unknown> | null): string | null {
  if (!version) return null;
  for (const key of ["title", "name", "label", "slug"]) {
    const v = version[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export function adminPayloadVersionDiff(before: unknown, after: unknown): AdminPayloadVersionDiffEntry[] {
  const b = unwrapVersion(before);
  const a = unwrapVersion(after);
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: AdminPayloadVersionDiffEntry[] = [];
  for (const field of keys) {
    const hasB = Object.prototype.hasOwnProperty.call(b, field);
    const hasA = Object.prototype.hasOwnProperty.call(a, field);
    if (hasB && !hasA) {
      out.push({ field, before: b[field], kind: "removed" });
      continue;
    }
    if (!hasB && hasA) {
      out.push({ field, after: a[field], kind: "added" });
      continue;
    }
    const vb = b[field];
    const va = a[field];
    if (shallowEqual(vb, va)) continue;
    out.push({ field, before: vb, after: va, kind: "changed" });
  }
  return out;
}

export function createAdminPayloadVersionHistory({
  content,
  collection,
}: {
  content: Pick<AdminPayloadContent, "findVersions" | "findVersionByID" | "restoreVersion">;
  collection: string;
}): AdminPayloadVersionHistory {
  return {
    async list(id, page = 1) {
      const result = (await content.findVersions(collection, {
        where: { parent: { equals: id } },
        sort: "-createdAt",
        limit: 50,
        page,
        depth: 0,
      })) as { docs?: unknown[] } | unknown;
      const docs = Array.isArray((result as { docs?: unknown[] })?.docs)
        ? ((result as { docs: unknown[] }).docs)
        : Array.isArray(result)
          ? (result as unknown[])
          : [];
      return docs.map((doc) => {
        const rec = (doc && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
        const version = isPlainObject(rec.version) ? (rec.version as Record<string, unknown>) : null;
        const createdAtRaw = rec.createdAt ?? rec.versionAt ?? rec.updatedAt ?? null;
        const createdAt = typeof createdAtRaw === "string" ? createdAtRaw : createdAtRaw == null ? null : String(createdAtRaw);
        return {
          id: rec.id as string | number,
          versionAt: createdAt,
          createdAt,
          updatedAt: typeof rec.updatedAt === "string" ? rec.updatedAt : rec.updatedAt == null ? null : String(rec.updatedAt),
          author: authorFrom(rec.createdBy ?? rec.author ?? rec.updatedBy),
          label: labelFrom(version ?? rec),
          createdBy: rec.createdBy ?? null,
        };
      });
    },
    async read(_id, versionId) {
      const doc = await content.findVersionByID(collection, versionId, { depth: 0 });
      return doc as AdminPayloadVersionDocument;
    },
    diff: adminPayloadVersionDiff,
    async restore(versionId, args = {}) {
      return content.restoreVersion(collection, versionId, args);
    },
  };
}
