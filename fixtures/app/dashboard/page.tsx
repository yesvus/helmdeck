// SPDX-License-Identifier: MIT

import {
  AdminDashboardLayout,
  adminDashboardAddPlacement,
  adminDashboardValidate,
  createAdminWidgetRegistry,
  defineAdminWidget,
  type AdminDashboard,
} from "@yesvus/helmdeck";

const registry = createAdminWidgetRegistry({
  signups: defineAdminWidget<{ total: number; trend: number }>({
    id: "signups",
    title: "Signups this month",
    sizes: ["sm", "md", "lg"],
    isEmpty: (data) => data.total === 0,
    render: (data) => (
      <p className="text-2xl font-semibold text-zinc-900">
        {data.total}
        <span className="ml-2 text-sm font-normal text-zinc-500">
          {data.trend >= 0 ? `+${data.trend}%` : `${data.trend}%`}
        </span>
      </p>
    ),
  }),
  revenue: defineAdminWidget<{ total: number }>({
    id: "revenue",
    title: "Revenue",
    sizes: ["lg", "xl"],
    render: (data) => <p className="text-2xl font-semibold text-zinc-900">{data.total}</p>,
  }),
  orders: defineAdminWidget<{ pending: number }>({
    id: "orders",
    title: "Orders awaiting review",
    sizes: ["sm", "md"],
    render: (data) => <p className="text-2xl font-semibold text-zinc-900">{data.pending}</p>,
  }),
  notes: defineAdminWidget<{ count: number }>({
    id: "notes",
    title: "Release notes",
    sizes: ["sm", "md", "lg", "xl"],
    render: (data) => <p className="text-sm text-zinc-600">{data.count} published this quarter.</p>,
  }),
});

const base: AdminDashboard = { name: "overview", placements: [] };

const dashboard: AdminDashboard = ["signups", "orders", "revenue", "notes"].reduce(
  (current, widget) => adminDashboardAddPlacement(current, registry, widget),
  base,
);

const states = {
  [dashboard.placements[0].id]: { status: "ready" as const, data: { total: 1284, trend: 12 } },
  [dashboard.placements[1].id]: { status: "ready" as const, data: { pending: 37 } },
  [dashboard.placements[2].id]: { status: "ready" as const, data: { total: 48210 } },
  [dashboard.placements[3].id]: { status: "ready" as const, data: { count: 4 } },
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          A declared arrangement of widgets on a responsive grid. No positioning library, so this
          page is a server component.
        </p>
      </header>

      <AdminDashboardLayout registry={registry} placements={dashboard.placements} states={states} />

      <section className="rounded-admin-card border border-dashed border-admin-border bg-admin-surface p-5">
        <h2 className="text-sm font-semibold text-zinc-900">The arrangement validates against the registry</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {adminDashboardValidate(registry, dashboard.placements).size} problems across{" "}
          {dashboard.placements.length} placements.
        </p>
      </section>
    </div>
  );
}
