import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function AdminSkeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200/80", className)} {...props} />;
}

export function AdminContentSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <AdminSkeleton className="mb-2 h-3 w-24" />
        <AdminSkeleton className="mb-2 h-7 w-48 bg-zinc-300" />
        <AdminSkeleton className="h-4 w-80 bg-zinc-100" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <AdminSkeleton className="h-10 w-full rounded-2xl border border-zinc-100 bg-white" />
          <AdminSkeleton className="h-10 w-10 shrink-0 rounded-2xl border border-zinc-100 bg-white" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-white px-5 py-4"
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
