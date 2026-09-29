// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminBanner,
  AdminEmptyState,
  AdminField,
  AdminInput,
  AdminSurfaceCard,
  AdminTextarea,
  Button,
} from "@yesvus/helmdeck";
// Type only, and erased at compile time: the module that reaches the store is server code and a
// browser must not be handed it. The values arrive as props from the page that resolved the session.
import type { PostRevision, PostSnapshot } from "../../../lib/demo-revisions";
import { publishPostAction, restorePostRevisionAction, savePostAction, unpublishPostAction } from "./actions";
import { causeLabels, formatWhen, preview } from "./describe";

/**
 * One post, its editor, and its history.
 *
 * The editor writes title and body. It does not write the status, because the status is not a field
 * a form owns: it moves through publish and unpublish, which refuse the moves that make no sense and
 * record themselves either way. That is the whole workflow, and it is small enough to be the truth
 * about a two-valued column rather than a stage machine.
 *
 * `canWrite` is the rule's own answer for this session, passed down from the page, so a button that
 * is not rendered here is also an action the server refuses. The action checks it again either way.
 */
export function PostHistory({
  post,
  revisions,
  canWrite,
}: {
  post: PostSnapshot & { id: string };
  revisions: PostRevision[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  async function run(name: string, work: () => Promise<unknown>) {
    setError(undefined);
    setPending(name);
    try {
      await work();
      // The list below is server-rendered, so a fresh answer is what puts the new version in it.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(undefined);
    }
  }

  const busy = (name: string) => pending === name;
  const blocked = pending !== undefined;
  const isPublished = post.status === "published";
  // A restore says which version went back, and a revision id is not something a person can read.
  const positions = new Map(revisions.map((revision) => [revision.id, revision.position]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{post.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isPublished ? "Published" : "Draft"} · {revisions.length} recorded{" "}
            {revisions.length === 1 ? "change" : "changes"}
          </p>
        </div>
        {canWrite ? (
          isPublished ? (
            <Button
              variant="outline"
              disabled={blocked}
              onClick={() => void run("unpublish", () => unpublishPostAction(post.id))}
            >
              {busy("unpublish") ? "Unpublishing…" : "Unpublish"}
            </Button>
          ) : (
            <Button
              disabled={blocked}
              onClick={() => void run("publish", () => publishPostAction(post.id))}
            >
              {busy("publish") ? "Publishing…" : "Publish"}
            </Button>
          )
        ) : null}
      </header>

      {error ? <AdminBanner tone="danger" title="That change was refused" body={error} /> : null}

      <AdminSurfaceCard>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Content</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Saving records the version this one replaces. The status moves through publish above.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <AdminField label="Title" id={`title-${post.id}`}>
            <AdminInput
              id={`title-${post.id}`}
              value={title}
              disabled={!canWrite || blocked}
              onChange={(event) => setTitle(event.target.value)}
            />
          </AdminField>
          <AdminField label="Body" id={`body-${post.id}`}>
            <AdminTextarea
              id={`body-${post.id}`}
              rows={6}
              value={body}
              disabled={!canWrite || blocked}
              onChange={(event) => setBody(event.target.value)}
            />
          </AdminField>
          {canWrite ? (
            <div className="flex justify-end">
              <Button
                disabled={blocked}
                onClick={() => void run("save", () => savePostAction({ postId: post.id, title, body }))}
              >
                {busy("save") ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              This session may read the history and not change the post.
            </p>
          )}
        </div>
      </AdminSurfaceCard>

      <AdminSurfaceCard>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">History</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Newest first. Each entry is what the post held before that change.
          </p>
        </div>
        {revisions.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title="Nothing recorded yet"
              body="The first save from here records the version it replaces. Until then the post's own row is the only account of its content."
            />
          </div>
        ) : (
          <ol className="divide-y divide-admin-border">
            {revisions.map((revision) => (
              <li key={revision.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {causeLabels[revision.cause]}
                    {revision.cause === "restore" ? (
                      <span className="ml-2 font-normal text-zinc-500">
                        from{" "}
                        {revision.restored_from
                          ? `version ${positions.get(revision.restored_from) ?? "an earlier one"}`
                          : "an earlier version"}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    <time dateTime={revision.created_at}>{formatWhen(revision.created_at)}</time> ·{" "}
                    {revision.actor_email}
                    {revision.actor_role ? ` (${revision.actor_role})` : ""}
                  </p>
                </div>
                <p className="mt-1 text-sm text-zinc-700">
                  <span className="font-medium">{revision.title}</span>
                  {revision.status === "published" ? "" : " · was a draft"}
                </p>
                {revision.body ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-zinc-500">
                      {preview(revision.body, 90)}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                      {revision.body}
                    </p>
                  </details>
                ) : null}
                {canWrite ? (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={blocked}
                      onClick={() =>
                        void run(`restore:${revision.id}`, () =>
                          restorePostRevisionAction(post.id, revision.id),
                        )
                      }
                    >
                      {busy(`restore:${revision.id}`) ? "Restoring…" : "Put this version back"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </AdminSurfaceCard>
    </div>
  );
}
