// SPDX-License-Identifier: MIT
"use client";

/**
 * The dashboard as the store arranged it.
 *
 * A client component, and the reason is the data rather than the grid. `AdminDashboardLayout` is
 * server-safe because the host resolves every widget's state and hands over a plain map; a live
 * dashboard instead hands over a loader per tile, and a function cannot be passed from a server
 * component into a client one. The arrangement arrives as a resolved prop, because it is rows and
 * rows cross that boundary as data.
 */

import Link from "next/link";
import {
  AdminDashboardTiles,
  adminDashboardValidate,
  type AdminDashboard,
} from "@yesvus/helmdeck";
import { dashboardRegistry } from "./registry";
import { dashboardLoadersFor } from "./widgets";

export default function DashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  const problems = adminDashboardValidate(dashboardRegistry, dashboard.placements);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500">
            Every tile reads the store through the same actions the product and order pages use, and
            the arrangement is read from it too. The signups tile asks for a table this admin does not
            expose, and the average order value waits on a slow query.
          </p>
        </div>
        <Link
          href="/dashboard/arrange"
          className="text-sm font-semibold text-admin-brand-text hover:underline"
        >
          Arrange this dashboard
        </Link>
      </header>

      <AdminDashboardTiles
        registry={dashboardRegistry}
        placements={dashboard.placements}
        loaders={dashboardLoadersFor(dashboard.placements)}
      />

      <section className="rounded-admin-card border border-dashed border-admin-border bg-admin-surface p-5">
        <h2 className="text-sm font-semibold text-zinc-900">The arrangement validates against the registry</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {problems.size} problems across {dashboard.placements.length} placements, read from the
          saved rows rather than from a constant in the bundle.
        </p>
      </section>
    </div>
  );
}
