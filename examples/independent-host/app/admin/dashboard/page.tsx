import { AdminPageHeader } from "@yesvus/helmdeck";
import { EngineDashboard } from "@/components/engine-dashboard";

export default function DashboardPage() {
  return <div className="space-y-6">
    <AdminPageHeader title="Dashboard" />
    <EngineDashboard />
  </div>;
}
