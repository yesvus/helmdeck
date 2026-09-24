"use client";

import Link from "next/link";
import { useState } from "react";
import { demoProducts } from "../../../demo-workspace";

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const products = demoProducts.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="mt-1 text-sm text-zinc-500">Manage the Northstar Supply catalog and inventory.</p></div><Link href="/shell/products/new" className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Add product</Link></header>
    <section className="grid gap-4 sm:grid-cols-3">{[["All products", "128"], ["Published", "112"], ["Needs attention", "6"]].map(([label, value]) => <article key={label} className="rounded-xl border border-zinc-200 bg-white p-4"><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></article>)}</section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><label className="sr-only" htmlFor="product-search">Search products</label><input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or SKU" className="w-full max-w-sm rounded-lg border border-zinc-300 px-3 py-2 text-sm"/><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-zinc-200 text-xs text-zinc-500"><tr>{["Product", "SKU", "Category", "Stock", "Price", "Status"].map((label) => <th key={label} className="py-3 font-medium">{label}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.sku} className="border-b border-zinc-100"><td className="py-3 font-semibold">{product.name}</td><td>{product.sku}</td><td>{product.category}</td><td>{product.stock}</td><td>{product.price}</td><td><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs">{product.status}</span></td></tr>)}</tbody></table>{products.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No products found. Try a different name or SKU.</p>}</div></section>
  </div>;
}
