import Link from "next/link";
import { notFound } from "next/navigation";
import { readBlogPosts } from "@/lib/payload/blog";
import { BLOG_BASE_PATH } from "@/lib/payload/routes";
import { SiteNav } from "@/components/site-nav";

export const metadata = { title: "Blog" };

export default async function BlogPage() {
  if (!BLOG_BASE_PATH) notFound();
  const result = await readBlogPosts();
  return <main className="mx-auto max-w-5xl space-y-10 px-6 py-16"><div className="mb-6"><SiteNav /></div><header className="max-w-2xl space-y-3"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">Journal</p><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Ideas, stories, and updates</h1><p className="text-lg text-zinc-600">The latest from our team.</p></header>{result.docs.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{result.docs.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">{typeof post.heroImage === "object" && post.heroImage?.url ? <img className="aspect-[16/10] w-full object-cover" src={post.heroImage.url} alt={String(post.heroImage.alt ?? "")} /> : null}<div className="space-y-3 p-6"><p className="text-sm text-zinc-500">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en", { dateStyle: "long" }) : ""}</p><h2 className="text-xl font-semibold"><Link className="hover:text-amber-700" href={`${BLOG_BASE_PATH}/${post.slug}`}>{post.title}</Link></h2><p className="leading-6 text-zinc-600">{post.excerpt}</p></div></article>)}</div> : <p className="rounded-2xl border border-dashed border-zinc-300 p-10 text-zinc-600">No stories published yet.</p>}</main>;
}
