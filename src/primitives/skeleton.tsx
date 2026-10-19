// SPDX-License-Identifier: MIT
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.js";

const normalizePlaceholderCount = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(20, Math.max(0, Math.floor(value))) : fallback;

export function AdminSkeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-admin-skeleton", className)}
    />
  );
}

export function AdminLoadingState({
  label,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-6", className)} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function AdminContentSkeleton({ className }: { className?: string } = {}) {
  return (
    <div aria-hidden="true" className={cn("space-y-6", className)}>
      <div>
        <AdminSkeleton className="mb-2 h-3 w-24" />
        <AdminSkeleton className="mb-2 h-7 w-48" />
        <AdminSkeleton className="h-4 w-80 bg-zinc-100" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <AdminSkeleton className="h-10 w-full rounded-2xl border border-zinc-100 bg-admin-surface" />
          <AdminSkeleton className="h-10 w-10 shrink-0 rounded-2xl border border-zinc-100 bg-admin-surface" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-admin-surface px-5 py-4"
          >
            <div className="flex items-center gap-4">
              <AdminSkeleton className="h-10 w-10 shrink-0 rounded-xl bg-zinc-50" />
              <div className="space-y-1.5">
                <AdminSkeleton className="h-4 w-40" />
                <AdminSkeleton className="h-3 w-60 bg-zinc-50" />
              </div>
            </div>
            <AdminSkeleton className="h-8 w-20 rounded-2xl bg-zinc-50" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminTableSkeleton({
  rowCount = 5,
  columnCount = 4,
  className,
}: {
  rowCount?: number;
  columnCount?: number;
  className?: string;
}) {
  const rows = normalizePlaceholderCount(rowCount, 5);
  const columns = normalizePlaceholderCount(columnCount, 4);

  return (
    <div aria-hidden="true" className={cn("overflow-hidden rounded-xl border border-admin-border", className)}>
      <div className="flex gap-4 border-b border-admin-border bg-admin-surface-muted px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <AdminSkeleton
            key={index}
            className={cn("h-3 flex-1", index === 0 && "max-w-40")}
          />
        ))}
      </div>
      <div className="divide-y divide-admin-border">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-4 py-4">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <AdminSkeleton key={columnIndex} className={cn("h-4 flex-1", columnIndex === 0 && "max-w-40")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminFormSkeleton({ fieldCount = 4, className }: { fieldCount?: number; className?: string }) {
  const fields = normalizePlaceholderCount(fieldCount, 4);

  return (
    <div aria-hidden="true" className={cn("space-y-5", className)}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <AdminSkeleton className="h-4 w-28" />
          <AdminSkeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <AdminSkeleton className="h-9 w-24 rounded-lg" />
        <AdminSkeleton className="h-9 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function AdminCardGridSkeleton({
  cardCount = 4,
  className,
}: {
  cardCount?: number;
  className?: string;
}) {
  const cards = normalizePlaceholderCount(cardCount, 4);

  return (
    <div aria-hidden="true" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-admin-border bg-admin-surface p-5">
          <AdminSkeleton className="h-3 w-24" />
          <AdminSkeleton className="h-7 w-28" />
          <AdminSkeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-6", className)}>
      <AdminCardGridSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-admin-border bg-admin-surface p-5 lg:col-span-2">
          <AdminSkeleton className="h-5 w-40" />
          <AdminSkeleton className="h-56 w-full rounded-lg" />
        </div>
        <div className="space-y-4 rounded-xl border border-admin-border bg-admin-surface p-5">
          <AdminSkeleton className="h-5 w-32" />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <AdminSkeleton className="h-8 w-8 shrink-0 rounded-full" />
              <AdminSkeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
