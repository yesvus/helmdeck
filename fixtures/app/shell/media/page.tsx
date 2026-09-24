"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminMediaPlaceholder, formatMediaSize, getAdminMediaThumbnailUrl, type AdminMediaItem } from "@yesvus/helmdeck";
import { getDemoMediaItems } from "../../../media";

export default function MediaPage() {
  const [items, setItems] = useState<AdminMediaItem[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void getDemoMediaItems().then((records) => {
      if (active) setItems(records);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const visible = items.filter((item) => `${item.name} ${item.kind}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">Media library</h1><p className="mt-1 text-sm text-zinc-500">Product photography and campaign assets for your workspace.</p></div><Link href="/media" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2">Upload media</Link></header>
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">All files</h2><p className="mt-1 text-sm text-zinc-500">{visible.length} {visible.length === 1 ? "asset" : "assets"}</p></div><label className="sr-only" htmlFor="media-search">Search media</label><input id="media-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"/></div>
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {loading && <p role="status" className="mt-5 text-sm text-zinc-500">Loading media library…</p>}
      {error && <p role="alert" className="mt-5 text-sm text-red-700">Media library could not be loaded.</p>}
      {!loading && !error && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible.map((item) => {
        const thumbnail = getAdminMediaThumbnailUrl(item);
        const hasImagePreview = item.kind === "image" || item.kind === "youtube";
        return <article key={item.path} className="overflow-hidden rounded-xl border border-zinc-200"><div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-zinc-100">{thumbnail && hasImagePreview ? <div role="img" aria-label={`${item.name} preview`} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${thumbnail}")` }} /> : <AdminMediaPlaceholder kind={item.kind === "pdf" ? "pdf" : item.kind === "video" ? "video" : "external"} label={`${item.name}, ${item.kind}`} />}</div><div className="p-3"><h3 className="truncate text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs capitalize text-zinc-500">{item.kind}{item.size ? ` · ${formatMediaSize(item.size)}` : ""}</p><button onClick={() => setNotice(`${item.name} selected for this demo.`)} className="mt-3 text-xs font-semibold text-brand-600 hover:underline focus-visible:outline-2">Select asset</button></div></article>;
      })}</div>}
      {!loading && !error && visible.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">No media matches your search.</p>}
    </section>
  </div>;
}
