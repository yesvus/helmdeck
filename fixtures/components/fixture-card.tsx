export function FixtureCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-admin-border bg-admin-surface p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="mt-2 text-sm text-zinc-600">{children}</div>
    </section>
  );
}
