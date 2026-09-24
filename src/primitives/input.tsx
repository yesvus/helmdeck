// SPDX-License-Identifier: MIT
import type { InputHTMLAttributes } from "react";
import { cn } from "../cn.js";

const adminControlClassName =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-sm leading-5 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500";

export const adminInputClassName = `h-11 ${adminControlClassName}`;

export function AdminInput({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(adminInputClassName, className)} {...props} />;
}

export function AdminTextarea({ className, ...props }: import("react").TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(adminControlClassName, "min-h-28 py-3", className)} {...props} />;
}
