// SPDX-License-Identifier: MIT
"use client";

import { Info } from "lucide-react";
import { Tooltip } from "./tooltip.js";

export function AdminContextualHelp({ label, children, className }: { label: string; children: string; className?: string }) {
  return <Tooltip className={className} label={label} content={children} side="bottom" sideOffset={8}><button type="button" className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"><Info className="h-4 w-4" aria-hidden="true" /></button></Tooltip>;
}
