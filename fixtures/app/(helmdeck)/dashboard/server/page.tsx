import { AdminDashboardServerTiles } from "@yesvus/helmdeck";
import { loadServerCatalogTotals, loadServerRevenue, loadServerSignupCount } from "../../../../lib/dashboard-server-loaders";
import { dashboardRegistry } from "../registry";

const placements = [
  { id: "server-signups", widget: "signups", size: "sm" as const },
  { id: "server-catalog", widget: "catalog", size: "sm" as const },
  { id: "server-revenue", widget: "revenue", size: "lg" as const },
];

export default function ServerDashboardPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-bold">Server-rendered dashboard tiles</h1>
      <AdminDashboardServerTiles
        registry={dashboardRegistry}
        placements={placements}
        loaders={{
          "server-signups": loadServerSignupCount,
          "server-catalog": loadServerCatalogTotals,
          "server-revenue": loadServerRevenue,
        }}
        messages={{
          widget: {
            emptyTitle: "Gösterilecek veri yok",
            emptyBody: "Bu araç için henüz veri yok.",
            errorTitle: "Araç yüklenemedi",
            retry: "Yeniden dene",
          },
        }}
      />
    </main>
  );
}
