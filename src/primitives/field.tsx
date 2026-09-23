"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../cn";

export function AdminField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="space-y-1">
        <span className="block text-sm font-semibold text-zinc-900">{label}</span>
        {hint ? <span className="block text-xs leading-6 text-zinc-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function AdminFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 lg:grid-cols-2", className)}>{children}</div>;
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
            {description ? (
              <span className="mt-1 block pr-6 text-xs leading-6 text-zinc-500">{description}</span>
            ) : null}
          </span>
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-transform duration-200",
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

export function AdminFormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}
