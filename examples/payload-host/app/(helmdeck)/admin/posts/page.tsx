import Link from "next/link";
import { readBlogPosts } from "@/lib/payload/blog";
import { readPayloadSession } from "@/lib/session";
import { isAdmin, principal } from "@/lib/rules";

export default async function PostsAdminPage() {
  const result = await readBlogPosts(isAdmin(principal(await readPayloadSession())));
  return <main className="space-y-6"><header><h1 className="text-2xl font-semibold">Posts</h1><p className="mt-1 text-sm text-zinc-600">Manage articles in Payload.</p></header><div className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-zinc-50 text-zinc-600"><tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Published</th></tr></thead><tbody>{result.docs.map((post) => <tr key={post.id} className="border-t border-zinc-100"><td className="px-4 py-3 font-medium">{post.title}</td><td className="px-4 py-3">{post.status}</td><td className="px-4 py-3">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString("en") : "—"}</td></tr>)}</tbody></table>{!result.docs.length ? <p className="p-6 text-sm text-zinc-600">No posts yet. Create one in <Link className="text-amber-700 underline" href="/payload/collections/posts">Payload.</Link></p> : null}</div></main>;
}
