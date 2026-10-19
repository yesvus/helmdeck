import Link from "next/link";
import { ContentBlockRenderer } from "@/components/content-block-renderer";
import { readContentBlocks } from "@/host/content-blocks";

export default async function BlocksPreviewPage() {
  const blocks = await readContentBlocks();
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-12">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Public page</p>
        <h1 className="mt-2 text-3xl font-bold">Sample workspace</h1>
      </div>
      <Link href="/admin/blocks" className="text-sm font-semibold text-indigo-700 underline">Edit content blocks</Link>
    </header>
    <ContentBlockRenderer blocks={blocks} locale="en" />
  </main>;
}
