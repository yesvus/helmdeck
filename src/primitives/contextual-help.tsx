// SPDX-License-Identifier: MIT
"use client";

import { Info } from "lucide-react";
import { Tooltip } from "./tooltip.js";

export function AdminContextualHelp({ label, children, className }: { label: string; children: string; className?: string }) {
  return <Tooltip className={className} label={label} content={children} side="bottom" sideOffset={8}><Info className="h-4 w-4" aria-hidden="true" /></Tooltip>;
}
