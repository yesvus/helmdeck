// SPDX-License-Identifier: MIT
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPages, globalContentGet } from "@/lib/payload/content";
import { resolvePageMetadata } from "@/lib/payload/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pages = await listPages(1000).catch(() => []);
  const page = pages.find((entry) => entry.slug === slug);
  if (!page) return { title: "Page not found" };
  const baseURL =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.HELMDECK_BASE_URL?.trim() ||
    "http://localhost:3000";
  const settings = await globalContentGet("siteSettings").catch(() => null);
  return resolvePageMetadata(page, (settings ?? null) as never, { baseURL });
}

export default async function PublicPage({ params }: Props) {
  const { slug } = await params;
  const pages = await listPages(1000).catch(() => []);
  const page = pages.find((entry) => entry.slug === slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{page.title}</h1>
      {page.summary ? <p className="mt-4 text-xl leading-8 text-zinc-600">{page.summary}</p> : null}
    </main>
  );
}
