// SPDX-License-Identifier: MIT
import type { Access } from "payload";
import type { AdminPayloadOperation } from "@yesvus/helmdeck";

export const payloadAccess = (operation: AdminPayloadOperation): Access => ({ req: { user } }) => {
  const role = user && "role" in user ? user.role : undefined;
  return role === "admin" || (role === "editor" && operation !== "delete");
};
