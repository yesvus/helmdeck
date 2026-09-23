// SPDX-License-Identifier: MIT
import type { SelectHTMLAttributes } from "react";
import { cn } from "../cn";
import { adminInputClassName } from "./input";

export function AdminSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(adminInputClassName, className)} {...props}>
      {children}
    </select>
  );
}
