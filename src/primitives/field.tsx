// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../cn.js";
import { AdminContextualHelp } from "./contextual-help.js";

export function AdminField({
  label,
  hint,
  error,
  id,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const Wrapper = id ? "div" : "label";
  return (
    <Wrapper className={cn("grid gap-2", className)}>
      {id ? (
        <label htmlFor={id} className="text-sm font-semibold leading-5 text-zinc-900">{label}</label>
      ) : (
        <span className="text-sm font-semibold leading-5 text-zinc-900">{label}</span>
      )}
      {hint ? <AdminContextualHelp label={`Help: ${label}`}>{hint}</AdminContextualHelp> : null}
      {children}
      {error ? <span className="text-sm leading-5 text-red-700" role="alert">{error}</span> : null}
    </Wrapper>
  );
}

export function AdminFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2", className)}>{children}</div>;
}

export function AdminFormSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4"
    >
      <summary className="cursor-pointer list-none">
        <span className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm font-semibold text-zinc-900">{title}</span>
            {description ? <span className="mt-1 block"><AdminContextualHelp label={`Help: ${title}`}>{description}</AdminContextualHelp></span> : null}
          </span>
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-admin-surface text-zinc-500 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
            aria-hidden="true"
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function AdminFormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:justify-end", className)}>{children}</div>;
}
