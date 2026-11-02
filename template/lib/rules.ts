import { redirect } from "next/navigation";
import { adminLoginHref, createAdminPermissionCheck, createAdminPermissionGuard } from "@yesvus/helmdeck";
import type { AdminPermission, AdminSession } from "@yesvus/helmdeck";
import { currentAdminSession } from "./session";
import { LOGIN_PATH } from "./sign-in";

export function can(session: AdminSession, permission: AdminPermission): boolean {
  if (!["products.create", "products.read", "products.update", "products.delete"].includes(permission)) return false;
  const operation = permission.slice("products.".length);
  return session.role === "admin" || (session.role === "editor" && operation !== "delete");
}

export const checkPermission = createAdminPermissionCheck({ rule: can, session: currentAdminSession });
export const requirePermission = createAdminPermissionGuard({ rule: can, session: currentAdminSession, onUnauthenticated: () => redirect(adminLoginHref(LOGIN_PATH, "/admin")) });
