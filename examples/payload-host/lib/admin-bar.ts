// SPDX-License-Identifier: MIT
import type { AdminPayloadUser } from "@yesvus/helmdeck";

type AdminBarProps = { dashboardHref: string; draftStatus: "live" | "draft"; editHref?: string };

export function resolveAdminBarProps(session: AdminPayloadUser | null, isDraft = false): AdminBarProps | null {
  if (!session || session.role !== "admin") return null;
  return { dashboardHref: "/admin", draftStatus: isDraft ? "draft" : "live" };
}
