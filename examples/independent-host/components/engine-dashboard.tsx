import { AdminDashboardLayout, adminStatWidget, adminWidgetSizes, createAdminWidgetRegistry, type AdminDashboardPlacement, type AdminWidgetState } from "@yesvus/helmdeck";

const projectCount = adminStatWidget({
  id: "project-count",
  title: "Projects",
  value: (data: { value: number }) => data.value,
  sizes: adminWidgetSizes,
});

const orderCount = adminStatWidget({
  id: "order-count",
  title: "Orders",
  value: (data: { value: number }) => data.value,
  sizes: adminWidgetSizes,
});

const registry = createAdminWidgetRegistry([projectCount, orderCount]);
const placements: AdminDashboardPlacement[] = [
  { id: "projects-tile", widget: projectCount.id, size: "sm" },
  { id: "orders-tile", widget: orderCount.id, size: "sm" },
];

const states: Readonly<Record<string, AdminWidgetState<unknown>>> = {
  "projects-tile": { status: "ready", data: { value: 2 } },
  "orders-tile": { status: "ready", data: { value: 2 } },
};

export function EngineDashboard() {
  return <AdminDashboardLayout registry={registry} placements={placements} states={states} />;
}
