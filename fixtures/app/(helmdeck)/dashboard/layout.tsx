// SPDX-License-Identifier: MIT

/**
 * The dashboard route, behind the session.
 *
 * Guarded in the layout rather than in the page, so the page stays about widgets and so anything
 * else that lands in this segment is covered by the same one check.
 */

import type { ReactNode } from "react";
import { requireDemoSession } from "../../../lib/demo-guard";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireDemoSession({ returnTo: "/dashboard" });
  return children;
}
