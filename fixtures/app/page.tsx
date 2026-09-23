"use client";

import Link from "next/link";
import { AdminBreadcrumbs, AdminMobileNav, AdminNavLink, AdminProfileMenu, AdminSearch } from "../../src";
import { sampleNav, sampleSearchEntries } from "../nav";

const stories = [
  {
    title: "AdminShell",
    href: "/shell",
    note: "Sidebar, topbar, group collapse, active states. Narrow the window below 1024px for the mobile bottom nav.",
  },
  {
    title: "AdminLoginScreen",
    href: "/login",
    note: "Presentational form. Submits to a local handler, no auth logic.",
  },
];

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">{title}</h2>
      {children}
    </section>
  );
}

export default function IndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">helmdeck fixtures</h1>
      <p className="mt-1 text-sm text-zinc-500">
        One story per shell component, plus two routed pages.
      </p>

      <div className="mt-6 grid gap-3">
        {stories.map((story) => (
          <Link
            key={story.href}
            href={story.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-brand-500"
          >
            <span className="font-semibold">{story.title}</span>
            <span className="mt-1 block text-sm text-zinc-500">{story.note}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4">
        <Frame title="AdminBreadcrumbs (story path: /shell/products/new)">
          <AdminBreadcrumbs groups={sampleNav} pathname="/shell/products/new" />
        </Frame>

        <Frame title="AdminNavLink (default, icon-only, compact)">
          <div className="max-w-xs space-y-1">
            <AdminNavLink item={sampleNav[1].items[0]} />
            <AdminNavLink item={sampleNav[1].items[0]} iconOnly />
            <AdminNavLink item={sampleNav[1].items[0]} compact />
          </div>
        </Frame>

        <Frame title="AdminSearch (Ctrl/⌘ K focuses it inside the shell)">
          <div className="max-w-sm">
            <AdminSearch groups={sampleNav} entries={sampleSearchEntries} />
          </div>
        </Frame>

        <Frame title="AdminProfileMenu">
          <div className="max-w-xs rounded-lg border border-zinc-100">
            <AdminProfileMenu email="editor@demo.test" profileHref="/shell" viewSiteHref="/" onLogout={() => {}} />
          </div>
        </Frame>

        <Frame title="AdminMobileNav (fixed to the bottom of this page)">
          <p className="text-sm text-zinc-500">
            Primary items come from <code>mobilePrimary</code>, the rest land under More.
          </p>
          <AdminMobileNav groups={sampleNav} />
        </Frame>
      </div>
    </main>
  );
}
