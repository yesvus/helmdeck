// SPDX-License-Identifier: MIT
import type { Access, PayloadRequest } from "payload";

type UserRecord = { id: string | number; role?: unknown };

async function record(payload: PayloadRequest["payload"], id: string | number | undefined): Promise<UserRecord | null> {
  if (id === undefined || id === null) return null;
  return await payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true }) as UserRecord;
}

async function adminCount(payload: PayloadRequest["payload"]): Promise<number> {
  return (await payload.count({ collection: "users", where: { role: { equals: "admin" } }, overrideAccess: true })).totalDocs;
}

export const guardUserUpdate: Access = async ({ req, id, data }) => {
  if (!req.user || req.user.role !== "admin") return false;
  if (id === undefined || id === null) return false;
  const target = await record(req.payload, id);
  if (!target) return false;
  const currentId = String(req.user.id);
  const targetId = String(target.id);
  const nextRole = typeof data?.role === "string" ? data.role : target.role;
  if (currentId === targetId && nextRole !== "admin") return false;
  if (target.role === "admin" && nextRole !== "admin" && await adminCount(req.payload) <= 1) return false;
  return true;
};

export const guardUserDelete: Access = async ({ req, id }) => {
  if (!req.user || req.user.role !== "admin" || id === undefined || id === null) return false;
  if (String(req.user.id) === String(id)) return false;
  const target = await record(req.payload, id);
  if (!target) return false;
  return target.role !== "admin" || await adminCount(req.payload) > 1;
};
