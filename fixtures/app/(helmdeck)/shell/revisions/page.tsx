// SPDX-License-Identifier: MIT
import Link from "next/link";
import { AdminEmptyState, AdminSurfaceCard } from "@yesvus/helmdeck";
import { requireDemoSession } from "../../../../lib/demo-guard";
import { listPostsWithHistory } from "../../../../lib/demo-revisions";
import { formatWhen } from "./describe";

/**
 * The posts whose history can be read, and how much of it there is.
 *
 * On the server, holding the session itself, so the list is the rule's answer for this person rather
 * than a table filtered in the browser after everything was fetched.
 */
export default async function RevisionsPage() {
  const session = await requireDemoSession({ returnTo: "/shell/revisions" });
  const posts = await listPostsWithHistory(session);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Post history</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every save records the version it replaced, and any of them can be put back.
        </p>
      </header>

      <AdminSurfaceCard>
        {posts.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title="No posts yet"
              body="A post's history starts with the first change made to it."
            />
          </div>
        ) : (
          <ul className="divide-y divide-admin-border">
            {posts.map((entry) => (
              <li key={entry.post.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link
                    href={`/shell/revisions/${entry.post.id}`}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {entry.post.title}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">
                    {entry.post.status === "published" ? "Published" : "Draft"} ·{" "}
                    {entry.revisions === 0
                      ? "nothing recorded yet"
                      : `${entry.revisions} recorded ${entry.revisions === 1 ? "change" : "changes"}`}
                    {entry.latest ? ` · last ${formatWhen(entry.latest)}` : ""}
                  </p>
                </div>
                <Link
                  href={`/shell/revisions/${entry.post.id}`}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  History
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminSurfaceCard>
    </div>
  );
}
