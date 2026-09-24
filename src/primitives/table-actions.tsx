// SPDX-License-Identifier: MIT
"use client";

import { useState, type ReactNode } from "react";
import { cn } from "../cn.js";

export function useAdminTableSelection<Key extends string | number>(initialKeys: Key[] = []) {
  const [selectedKeys, setSelectedKeys] = useState<Set<Key>>(() => new Set(initialKeys));
  return { selectedKeys, setSelectedKeys };
}

export function AdminTableRowActions({
  children,
  destructive,
  label,
  className,
}: {
  children: ReactNode;
  destructive?: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex min-w-0 flex-wrap items-center justify-start gap-2", className)}>
      {children}
      {destructive ? <span className="ml-1 inline-flex border-l border-zinc-200 pl-2">{destructive}</span> : null}
    </div>
  );
}

export function AdminTableBulkActions({
  selectedCount,
  selectedCountLabel,
  children,
  className,
}: {
  selectedCount: number;
  selectedCountLabel: (count: number) => string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3", className)}>
      <span aria-live="polite" aria-atomic="true" className="min-w-0 text-sm font-medium text-zinc-700">
        {selectedCountLabel(selectedCount)}
      </span>
      {selectedCount > 0 ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
