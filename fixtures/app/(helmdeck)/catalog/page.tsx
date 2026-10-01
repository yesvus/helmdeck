// SPDX-License-Identifier: MIT
"use client";

/**
 * The component catalogue: everything the package ships, grouped, searchable, and rendered where it
 * can be rendered. The list arrives from `demo-catalog`, which builds it from the package's own
 * export surface, so nothing here can fall behind the code it describes.
 */

import { useMemo, useState } from "react";
import {
  CATALOG_CATEGORIES,
  catalogSummary,
  componentCatalog,
  searchCatalog,
  type CatalogCategory,
  type CatalogEntry,
} from "../../../lib/demo-catalog";
import { catalogPreviews } from "./previews";

const KIND_LABELS = {
  component: "Component",
  hook: "Hook",
  function: "Function",
  constant: "Constant",
} as const;

function EntryCard({ entry }: { entry: CatalogEntry }) {
  const Preview = entry.renderable ? catalogPreviews[entry.name] : undefined;
  return (
    <article className="flex min-w-0 flex-col rounded-admin-card border border-admin-border bg-admin-surface">
      <header className="border-b border-admin-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-mono text-sm font-semibold text-zinc-900">{entry.name}</h3>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
            {KIND_LABELS[entry.kind]}
          </span>
          {entry.entryPoint !== "." ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-600">
              {entry.entryPoint}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-6 text-zinc-600">{entry.summary}</p>
      </header>
      <div className="flex-1 px-4 py-4">
        {Preview ? (
          <div data-catalog-preview={entry.name}>
            <Preview />
          </div>
        ) : entry.kind === "component" ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
            <span className="font-semibold text-zinc-800">Not shown here.</span> {entry.hostNote}
          </p>
        ) : (
          <div className="space-y-2">
            {entry.signature ? (
              <p className="font-mono text-xs text-zinc-500">{entry.signature}</p>
            ) : null}
            {entry.valueText ? (
              <pre className="overflow-x-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-700">
                {entry.valueText}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory | null>(null);

  const results = useMemo(() => searchCatalog(componentCatalog, { query, category }), [query, category]);
  const grouped = useMemo(
    () =>
      CATALOG_CATEGORIES.map((name) => ({
        category: name,
        entries: results.filter((entry) => entry.category === name),
      })).filter((group) => group.entries.length > 0),
    [results],
  );

  const filtering = query.trim().length > 0 || category !== null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Component catalogue</h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Every export the package ships, read from its own entry points rather than from a list kept
          beside them. {catalogSummary.total} in all: {catalogSummary.renderable} of them render
          below, and the rest say what a host has to hand them first.
        </p>
        {catalogSummary.described < catalogSummary.total ? (
          <p className="rounded-admin-control border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {catalogSummary.total - catalogSummary.described} exports have no description yet, so they are
            not listed. A test fails until every export has one.
          </p>
        ) : null}
      </header>

      <div className="space-y-3 rounded-admin-card border border-admin-border bg-admin-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-56 flex-1 gap-1.5">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, category or what it does"
              aria-describedby="catalog-result-count"
              className="w-full rounded-admin-control border border-zinc-300 bg-admin-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          {filtering ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
              className="rounded-admin-control border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <CategoryChip label="All" count={catalogSummary.total} active={category === null} onClick={() => setCategory(null)} />
          {catalogSummary.byCategory.map(({ category: name, count }) => (
            <CategoryChip
              key={name}
              label={name}
              count={count}
              active={category === name}
              onClick={() => setCategory(name)}
            />
          ))}
        </div>

        <p id="catalog-result-count" aria-live="polite" className="text-xs text-zinc-500">
          Showing {results.length} of {catalogSummary.total} exports
          {query.trim() ? ` matching "${query.trim()}"` : ""}
          {category ? ` in ${category}` : ""}.
        </p>
      </div>

      {results.length === 0 ? (
        <div className="rounded-admin-card border border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center">
          <p className="text-sm font-semibold text-zinc-800">Nothing in the package matches that.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            The catalogue holds every export the package ships, so an empty result means the words do
            not appear in a name, a category or a description. Searching for a part of a name, such as{" "}
            <span className="font-mono">field</span> or <span className="font-mono">widget</span>,
            finds the most.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory(null);
            }}
            className="mt-4 rounded-admin-control border border-zinc-300 bg-admin-surface px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Show everything
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map((group) => (
            <section key={group.category} className="space-y-4">
              <div className="flex items-baseline gap-3 border-b border-zinc-200 pb-2">
                <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-700">{group.category}</h2>
                <span className="text-xs text-zinc-400">{group.entries.length}</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {group.entries.map((entry) => (
                  <EntryCard key={entry.name} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-900"
          : "rounded-full border border-admin-border px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
      }
    >
      {label}
      <span className={active ? "ml-1.5 text-zinc-500" : "ml-1.5 text-zinc-400"}>{count}</span>
    </button>
  );
}
