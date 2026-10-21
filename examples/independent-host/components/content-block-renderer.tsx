import { resolveExampleBlockHeading, type ExampleContentBlockEntry } from "../host/block-definition";

export function ContentBlockRenderer({ blocks, locale }: { blocks: ExampleContentBlockEntry[]; locale?: "en" | "tr" }) {
  return <div className="space-y-6">
    {blocks.map((entry) => {
      const heading = locale ? resolveExampleBlockHeading(entry, locale) : entry.heading;
      return entry.kind === "hero" ? (
        <section key={entry.id} className="grid gap-6 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Hero block</p>
            <h2 className="mt-2 text-2xl font-bold">{heading}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{entry.copy}</p>
          </div>
          {entry.imageUrl ? <img src={entry.imageUrl} alt={entry.imageAlt} className="max-h-72 w-full rounded-lg object-cover" /> : null}
        </section>
      ) : (
        <blockquote key={entry.id} className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Quote block</p>
          <h2 className="mt-2 text-xl font-semibold">{heading}</h2>
          <p className="mt-3 leading-7 text-zinc-700">“{entry.copy}”</p>
          <footer className="mt-4 text-sm font-medium text-zinc-500">{entry.attribution}</footer>
        </blockquote>
      );
    })}
  </div>;
}
