"use client";

import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  Code2,
  LayoutDashboard,
  Library,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useDemoLocale } from "../components/demo-i18n-provider";

const featureIcons = [LayoutDashboard, Blocks, Library, ShieldCheck];

export default function HomePage() {
  const { copy } = useDemoLocale();

  return (
    <main className="min-h-screen overflow-hidden bg-admin-surface-subtle text-zinc-950">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#18181b] text-sm font-black text-white">HD</span>
          <span>
            <span className="block text-sm font-bold tracking-tight">Helmdeck</span>
            <span className="block text-xs text-zinc-500">{copy.productDescription}</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/shell"
            className="hidden items-center gap-2 rounded-lg bg-[#18181b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-admin-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:inline-flex"
          >
            {copy.openDemo}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
        <div className="absolute -left-32 top-8 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-admin-border bg-admin-surface-muted px-3 py-1.5 text-xs font-semibold text-admin-brand-text">
            <Sparkles className="h-3.5 w-3.5" />
            Next.js App Router
          </div>
          <h1 className="max-w-3xl text-5xl font-black tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">{copy.heroBody}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/shell"
              className="inline-flex items-center gap-2 rounded-lg bg-[#18181b] px-5 py-3 text-sm font-bold text-white transition hover:bg-admin-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {copy.exploreShell}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/yesvus/helmdeck"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-admin-surface px-5 py-3 text-sm font-bold text-zinc-800 transition hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <Code2 className="h-4 w-4" />
              {copy.viewSource}
            </a>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            {copy.technologies.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-admin-success-text" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* admin-theme-fixed: a decorative pastel glow behind the mockup window, on both themes. */}
          <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-teal-200/70 via-[#fef3c7] to-rose-200/60 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-[#18181b] p-3 shadow-[0_40px_100px_-35px_rgba(15,23,42,.65)]">
            {/* admin-theme-fixed:start a static illustration of a light-mode screen. */}
            <div className="rounded-[1.4rem] bg-[#fafafa] p-5 text-[#18181b]">
              <div className="flex items-center justify-between border-b border-[#e5e5e5] pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-[#34d399]" />
                </div>
                <span className="text-xs font-semibold text-[#71717a]">helmdeck.yesvus.com</span>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[150px_1fr]">
                <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
                  {["Overview", "Products", "Media", "Orders", "Settings"].map((item, index) => (
                    <div
                      key={item}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? "bg-[#f5f5f4] text-[#b45309]" : "text-[#71717a]"}`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl bg-[#18181b] p-5 text-white">
                    <p className="text-xs uppercase tracking-[.2em] text-[#fef3c7]">Operations</p>
                    <p className="mt-2 text-2xl font-bold">Everything in view.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {["Published", "Pending", "Revenue", "Storage"].map((label, index) => (
                      <div key={label} className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
                        <p className="text-xs text-[#71717a]">{label}</p>
                        <p className="mt-2 text-xl font-bold">{[128, 14, "$48k", "68%"][index]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* admin-theme-fixed:end */}
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-admin-surface">
        <div className="mx-auto grid max-w-7xl gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
          {copy.features.map(([title, body], index) => {
            const Icon = featureIcons[index];
            return (
              <article key={title} className="bg-admin-surface p-7 lg:p-8">
                <Icon className="h-6 w-6 text-admin-brand-text" />
                <h2 className="mt-5 font-bold">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-zinc-500">{body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-admin-brand-text">Live examples</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{copy.liveExamples}</h2>
          <p className="mt-4 leading-7 text-zinc-600">{copy.liveExamplesBody}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {copy.demos.map(([href, label, body], index) => (
            <Link
              key={href}
              href={href}
              className={`group rounded-2xl border p-6 transition hover:-translate-y-1 hover:border-admin-brand-500 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${index === 0 ? "bg-[#18181b] text-white" : "border-zinc-200 bg-admin-surface"}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-[.18em] ${index === 0 ? "text-brand-100" : "text-admin-brand-text"}`}>Demo</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
              <h3 className="mt-8 text-xl font-bold">{label}</h3>
              <p className={`mt-2 text-sm leading-6 ${index === 0 ? "text-zinc-300" : "text-zinc-500"}`}>{body}</p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-zinc-200 bg-admin-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>{copy.footer}</span>
          <span>helmdeck.yesvus.com</span>
        </div>
      </footer>
    </main>
  );
}
