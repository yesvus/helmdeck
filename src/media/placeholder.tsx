// SPDX-License-Identifier: MIT
"use client";

import { ExternalLink, FileText, ImageIcon, Video } from "lucide-react";
import { cn } from "../cn.js";
import { useAdminMessages } from "../i18n.js";

export function AdminMediaPlaceholder({
  className,
  kind = "image",
  label,
}: {
  className?: string;
  kind?: "image" | "video" | "pdf" | "external";
  label?: string;
}) {
  const i18n = useAdminMessages();
  const Icon = kind === "pdf" ? FileText : kind === "video" ? Video : kind === "external" ? ExternalLink : ImageIcon;

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-400",
        className,
      )}
      role="img"
      aria-label={label ?? (kind === "pdf" ? i18n.common.pdfDocument : i18n.common.image)}
    >
      <Icon className="h-10 w-10" />
    </div>
  );
}
