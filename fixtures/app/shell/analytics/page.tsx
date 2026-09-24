"use client";

import { useState } from "react";

const salesByRange = {
  "Last 7 days": { values: [44, 62, 58, 78, 68, 92, 84], labels: ["Sep 18", "Sep 21", "Sep 24"] },
  "Last 30 days": { values: [38, 52, 44, 66, 58, 74, 62, 84, 71, 93, 78, 100, 86, 68, 92, 76, 88, 64], labels: ["Aug 26", "Sep 10", "Sep 24"] },
  "This year": { values: [36, 42, 48, 54, 50, 63, 69, 72, 82], labels: ["Jan", "May", "Sep"] },
} as const;

export default function AnalyticsPage() {
  const [range, setRange] = useState<keyof typeof salesByRange>("Last 30 days");
  const chart = salesByRange[range];
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">Analytics</h1><p className="mt-1 text-sm text-zinc-500">Track sales and customer engagement across your workspace.</p></div><label className="text-sm font-medium">Date range <select aria-label="Date range" value={range} onChange={(event) => setRange(event.target.value as keyof typeof salesByRange)} className="ml-2 rounded-lg border border-zinc-300 bg-white px-3 py-2"><option>Last 7 days</option><option>Last 30 days</option><option>This year</option></select></label></header>
    <section className="grid gap-4 sm:grid-cols-3">{[["Revenue", "$12,840", "+12.8%"], ["Average order value", "$69.78", "+4.3%"], ["Returning customers", "38.2%", "+2.1%"]].map(([label, value, delta]) => <article key={label} className="rounded-xl border border-zinc-200 bg-white p-5"><p className="text-sm text-zinc-500">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-2 text-xs font-semibold text-emerald-700">{delta} <span className="font-normal text-zinc-500">compared with previous period</span></p></article>)}</section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Sales over time</h2><p className="mt-1 text-sm text-zinc-500">Daily gross sales · {range.toLowerCase()}</p><div role="img" aria-label={`Sales chart for ${range}. Daily sales index values: ${chart.values.join(", ")}.`} className="mt-6 flex h-48 items-end gap-2 border-b border-zinc-200 px-2">{chart.values.map((height, index) => <div key={`${range}-${index}`} className="flex-1 rounded-t bg-brand-500/80 hover:bg-brand-600" style={{ height: `${height}%` }} />)}</div><div className="mt-3 flex justify-between text-xs text-zinc-500">{chart.labels.map((label) => <span key={label}>{label}</span>)}</div></section>
    <section className="grid gap-4 md:grid-cols-2"><article className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Top products</h2><ol className="mt-4 space-y-4 text-sm">{[["Operator Studio Desk", "$6,292"], ["Compact Loader", "$2,016"], ["Field Notes Set", "$864"]].map(([name, amount], i) => <li key={name} className="flex justify-between"><span><span className="mr-3 text-zinc-400">0{i + 1}</span>{name}</span><strong>{amount}</strong></li>)}</ol></article><article className="rounded-xl border border-zinc-200 bg-white p-5"><h2 className="font-semibold">Traffic sources</h2><ul className="mt-4 space-y-4 text-sm">{[["Direct", "42%"], ["Organic search", "34%"], ["Social", "24%"]].map(([source, share]) => <li key={source}><div className="mb-2 flex justify-between"><span>{source}</span><strong>{share}</strong></div><div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: share }} /></div></li>)}</ul></article></section>
  </div>;
}
