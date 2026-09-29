// SPDX-License-Identifier: MIT
"use client";

/**
 * The demo dashboard: a declared arrangement of widgets, each loading its own data.
 *
 * A client component, and the reason is the data rather than the grid. `AdminDashboardLayout` is
 * server-safe because the host resolves every widget's state and hands over a plain map; a live
 * dashboard instead hands over a loader per tile, and a function cannot be passed from a server
 * component into a client one. `AdminDashboardTiles` is the half that loads, so the page is on the
 * same side as the loaders.
 *
 * That leaves the guard where it was rather than moving it here: the layout above is still a server
 * component, so a request without a session is redirected before this page is rendered at all, and
 * the fact that the page itself ships as client code never becomes the thing being protected.
 */

import { AdminDashboardTiles, adminDashboardValidate } from "@yesvus/helmdeck";
import { dashboardLoaders, dashboardRegistry, demoDashboard } from "./widgets";

const placements = demoDashboard.placements;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          Every tile reads the store through the same actions the product and order pages use. The
          signups tile asks for a table this admin does not expose, and the average order value waits
          on a slow query.
        </p>
      </header>

      <AdminDashboardTiles
        registry={dashboardRegistry}
        placements={placements}
        loaders={dashboardLoaders}
      />

      <section className="rounded-admin-card border border-dashed border-admin-border bg-admin-surface p-5">
        <h2 className="text-sm font-semibold text-zinc-900">The arrangement validates against the registry</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {adminDashboardValidate(dashboardRegistry, placements).size} problems across{" "}
          {placements.length} placements.
        </p>
      </section>
    </div>
  );
}
