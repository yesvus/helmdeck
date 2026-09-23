// SPDX-License-Identifier: MIT
import { cn } from "../cn";

export type AdminStatusTone = "success" | "warning" | "error" | "info" | "neutral";

const toneClassName: Record<AdminStatusTone, string> = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
  neutral: "bg-zinc-100 text-zinc-700",
};

export function AdminStatusPill({
  tone = "neutral",
  label,
  className,
}: {
  tone?: AdminStatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", toneClassName[tone], className)}
    >
      {label}
    </span>
  );
}
