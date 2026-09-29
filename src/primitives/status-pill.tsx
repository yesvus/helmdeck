// SPDX-License-Identifier: MIT
import { cn } from "../cn.js";
import { adminToneClasses, type AdminTone } from "./tone.js";

// The shared union under the name this prop has always published, so a host that imported
// AdminStatusTone keeps compiling. See tone.ts for the vocabulary and the severity alias.
export type AdminStatusTone = AdminTone;

const toneClassName = adminToneClasses(
  {
    neutral: "bg-zinc-100 text-zinc-700",
    info: "bg-sky-100 text-sky-800",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
  },
  "bg-red-100 text-red-800",
);

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
