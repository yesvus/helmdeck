// SPDX-License-Identifier: MIT

import { cn } from "../cn.js";
import type { AdminWidgetSize } from "../widgets/types.js";

const sizeClasses: Record<AdminWidgetSize, string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "lg:col-span-3",
  xl: "lg:col-span-4",
};

export function dashboardPlacementClassName(size: AdminWidgetSize): string {
  return cn(sizeClasses[size], "min-w-0");
}
