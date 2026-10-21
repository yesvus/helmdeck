// SPDX-License-Identifier: MIT
"use client";

import { createContext, useContext } from "react";
import { isValidElement } from "react";
import type { ReactNode } from "react";

export type AdminFieldContextValue = {
  id?: string;
  labelId?: string;
  describedBy?: string;
  invalid: boolean;
};

export const AdminFieldContext = createContext<AdminFieldContextValue | null>(null);

export function useAdminFieldContext(): AdminFieldContextValue | null {
  return useContext(AdminFieldContext);
}

/**
 * A component that owns several inputs at once, such as a radio group, cannot be named by a
 * `for` attribute, because `for` only reaches a single labelable element. A group says so, and
 * AdminField renders a plain label element for it instead of a label that points at nothing.
 */
export function adminFormGroup<T>(component: T): T {
  (component as { adminFormGroup?: boolean }).adminFormGroup = true;
  return component;
}

export function isAdminFormGroup(children: ReactNode): boolean {
  if (Array.isArray(children)) return children.some((child) => isAdminFormGroup(child));
  if (!isValidElement(children)) return false;
  const type = children.type as { adminFormGroup?: boolean } | string | null;
  return typeof type === "object" && type !== null && type.adminFormGroup === true;
}
