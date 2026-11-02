// SPDX-License-Identifier: MIT
import { AdminVisitorTrendChart, adminAnalyticsSeries, adminChartDayRange, adminChartFormatters } from "@yesvus/helmdeck";
import { requireAdminSession } from "@/lib/guard";
import { principal, isAdmin } from "@/lib/rules";
import { payloadPersistence } from "@/lib/payload/persistence";

export default async function AnalyticsPage() {
  const session = await requireAdminSession({ returnTo: "/admin/analytics" });
  if (!isAdmin(principal(session))) return null;

  const store = await payloadPersistence();
  const range = adminChartDayRange(30, new Date());
  const series = await adminAnalyticsSeries(store, { range, kind: "page_view" });
  const points = series.points.map((point) => ({ key: point.key, label: point.label, views: point.views, visitors: point.visitors }));

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Visitor analytics</h1>
      <AdminVisitorTrendChart points={points} formatters={adminChartFormatters("count")} ariaLabel="Visitor trend" />
      <p className="text-sm text-admin-muted">Views: {series.totals.views} · Visitors: {series.totals.visitors}</p>
    </main>
  );
}
