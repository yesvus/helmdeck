"use client";

import { useMemo, useState } from "react";
import { demoOrders } from "../../../demo-workspace";

export default function OrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All orders");
  const [notice, setNotice] = useState("");
  const orders = useMemo(() => demoOrders.filter((order) => `${order.id} ${order.customer}`.toLowerCase().includes(query.toLowerCase()) && (status === "All orders" || order.status === status)), [query, status]);
  return <div className="space-y-6"><header><p className="text-sm text-zinc-500">Review payments, fulfillment, and customer details.</p></header>
    <section className="grid gap-4 sm:grid-cols-3">{[["Today", "12", "$1,684"], ["Awaiting fulfillment", "8", "Ready to ship"], ["Refund requests", "2", "Needs review"]].map(([label, value, sub]) => <article key={label} className="rounded-xl border border-zinc-200 bg-white p-4"><p className="text-sm text-zinc-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-zinc-500">{sub}</p></article>)}</section>
    <section className="rounded-xl border border-zinc-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">All orders</h2><p className="mt-1 text-sm text-zinc-500">{orders.length} matching orders</p></div><button onClick={() => setNotice("Order report prepared for this demo.")} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 focus-visible:outline-2">Export report</button></div>
      <div className="mt-4 flex flex-wrap gap-3"><label className="sr-only" htmlFor="order-search">Search orders</label><input id="order-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or customer" className="min-w-56 rounded-lg border border-zinc-300 px-3 py-2 text-sm"/><label className="sr-only" htmlFor="order-status">Filter by status</label><select id="order-status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"><option>All orders</option>{[...new Set(demoOrders.map((item) => item.status))].map((item) => <option key={item}>{item}</option>)}</select></div>
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-zinc-200 text-xs text-zinc-500"><tr>{["Order", "Customer", "Date", "Total", "Status", "Action"].map((label) => <th key={label} className="py-3 font-medium">{label}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-zinc-100"><td className="py-3 font-semibold">{order.id}</td><td>{order.customer}</td><td>{order.date}</td><td>{order.total}</td><td>{order.status}</td><td><button onClick={() => setNotice(`Order ${order.id} opened in the demo.`)} className="font-semibold text-brand-700 hover:underline">Details</button></td></tr>)}</tbody></table>{orders.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No orders match those filters. Try another search.</p>}</div>
    </section></div>;
}
