// SPDX-License-Identifier: MIT
import type { InputHTMLAttributes } from "react";
import { cn } from "../cn.js";

export const adminInputClassName =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500";

export function AdminInput({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(adminInputClassName, className)} {...props} />;
}
