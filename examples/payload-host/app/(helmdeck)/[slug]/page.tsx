// SPDX-License-Identifier: MIT
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPages, globalContentGet } from "@/lib/payload/content";
import { recordPageView } from "@/lib/payload/persistence";
import { resolvePageMetadata } from "@/lib/payload/seo";
import { createAdminBlockRegistry } from "@yesvus/helmdeck";

const blockRegistry = createAdminBlockRegistry([
  {
    type: "hero",
    schema: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } } },
    render: (block) => (
      <section className="mt-8">
        {block.heading ? <h2 className="text-2xl font-semibold">{String(block.heading)}</h2> : null}
        {block.body ? <p className="mt-2 text-zinc-600">{String(block.body)}</p> : null}
      </section>
    ),
  },
  {
    type: "text",
    schema: { type: "object", properties: { content: { type: "string" } } },
    render: (block) => (block.content ? <p className="mt-4 leading-7">{String(block.content)}</p> : null),
  },
]);

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
  void recordPageView({ path: `/${slug}` }).catch(() => {});
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{page.title}</h1>
      {page.summary ? <p className="mt-4 text-xl leading-8 text-zinc-600">{page.summary}</p> : null}
      {blockRegistry.render(Array.isArray(page.blocks) ? page.blocks : [])}
    </main>
  );
}
