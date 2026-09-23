export function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}
