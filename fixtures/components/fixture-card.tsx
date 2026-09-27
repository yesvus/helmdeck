import { AdminSurfaceCard } from "@yesvus/helmdeck";

export function FixtureCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <AdminSurfaceCard>
      <div className="p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="mt-2 text-sm text-zinc-600">{children}</div>
      </div>
    </AdminSurfaceCard>
  );
}
