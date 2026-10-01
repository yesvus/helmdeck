// SPDX-License-Identifier: MIT

/**
 * The way into Payload's admin panel, from helmdeck's own navigation.
 *
 * A link and nothing else. Payload's editor is its own application with its own routes, its own
 * document and its own login, so anything rendered here that tried to be an editor would be a
 * re-implementation of one: no lexical, no blocks, no drafts, no versions. What this page can honestly
 * offer is a door, and the shape of what is behind it.
 *
 * The documents listed are read through `listPayloadPages`, which passes `overrideAccess: false` and a
 * user. That is not decoration: Payload's Local API skips every access control unless told otherwise, so
 * a read written without those two arguments would show every document to every request that reached
 * this page, and the page is guarded by helmdeck's session rather than by Payload's.
 */

import Link from "next/link";
import { getPayload } from "payload";
import { listPayloadPages } from "../../../../lib/payload-content";

/** Where Payload's admin panel is mounted. The default, and named here rather than repeated. */
const PAYLOAD_ADMIN = "/admin";

export default async function StudioPage() {
  const payload = await getPayload({ config: (await import("../../../../payload.config")).default });

  // A refused read is not a failure of the page. An editor who may not read content sees the door and
  // nothing behind it, which is what Payload's own admin panel would do.
  const pages = await listPayloadPages(payload).catch(() => null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content studio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Content editing is Payload&apos;s. This panel is helmdeck&apos;s.
          </p>
        </div>
        <a
          href={PAYLOAD_ADMIN}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Open the editor
        </a>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-admin-surface p-5">
        <h2 className="font-semibold">What lives where</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-zinc-900">helmdeck</dt>
            <dd className="mt-1 text-sm text-zinc-500">
              The dashboard, the charts, the analytics, and CRUD over this demo&apos;s own tables.
              Everything you can reach from this sidebar.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-zinc-900">Payload</dt>
            <dd className="mt-1 text-sm text-zinc-500">
              Rich text, blocks, drafts and version history. You sign in once, here, and that session is
              the one the editor reads.
            </dd>
          </div>
        </dl>
      </section>

      {pages ? (
        <section className="rounded-xl border border-zinc-200 bg-admin-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Documents</h2>
            <span className="text-sm text-zinc-500">{pages.totalDocs} in Payload</span>
          </div>

          {pages.docs.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              No documents yet. Open the editor to write one, and it will appear here.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100">
              {pages.docs.map((page) => (
                <li key={page.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{page.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">/{page.slug}</p>
                  </div>
                  <Link
                    href={`${PAYLOAD_ADMIN}/collections/demo-pages/${page.id}`}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-admin-surface p-5">
          <p className="text-sm text-zinc-500">
            The documents could not be read for this session. The editor will decide what this account may
            do, and this page is not going to guess in the other direction.
          </p>
        </section>
      )}
    </div>
  );
}