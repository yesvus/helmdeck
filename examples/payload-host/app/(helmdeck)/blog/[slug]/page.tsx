import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readBlogPost } from "@/lib/payload/blog";
import { BLOG_BASE_PATH } from "@/lib/payload/routes";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string }> };

function textFromLexical(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; children?: unknown[] };
  return [typeof node.text === "string" ? node.text : "", ...(node.children ?? []).map(textFromLexical)].join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!BLOG_BASE_PATH) return { title: "Not found" };
  const { slug } = await params;
  const post = await readBlogPost(slug);
  if (!post) return { title: "Story not found" };
  const image = typeof post.heroImage === "object" ? post.heroImage : null;
  return { title: post.title, description: post.excerpt ?? undefined, openGraph: { images: image?.url ? [{ url: image.url, alt: String(image.alt ?? post.title) }] : undefined } };
}

export default async function BlogArticlePage({ params, searchParams }: Props) {
  if (!BLOG_BASE_PATH) notFound();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let post;
  try {
    post = await readBlogPost(slug, query.draft === "1");
  } catch {
    notFound();
  }
  if (!post) notFound();
  const image = typeof post.heroImage === "object" ? post.heroImage : null;
  return <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20"><Link href={BLOG_BASE_PATH} className="text-sm font-medium text-amber-700 hover:underline">← All stories</Link><article className="mt-8"><header className="space-y-5"><p className="text-sm text-zinc-500">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en", { dateStyle: "long" }) : "Draft"}</p><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{post.title}</h1>{post.excerpt ? <p className="text-xl leading-8 text-zinc-600">{post.excerpt}</p> : null}</header>{image?.url ? <img className="mt-10 max-h-[34rem] w-full rounded-2xl object-cover" src={image.url} alt={String(image.alt ?? post.title)} /> : null}<div className="prose prose-zinc mt-10 max-w-none whitespace-pre-wrap leading-8">{textFromLexical(post.content)}</div></article></main>;
}
