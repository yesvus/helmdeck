// SPDX-License-Identifier: MIT
import { notFound } from "next/navigation";
import { AdminBanner, AdminEmptyState, AdminInput, AdminSurfaceCard } from "@yesvus/helmdeck";
import { requireDemoSession } from "../../../lib/demo-guard";
import { demoCan } from "../../../lib/demo-rules";
import { demoNow, listPostSchedules, listSchedulablePosts, type ScheduledPublish } from "../../../lib/demo-scheduling";
import { runDuePublishesAction, schedulePostAction } from "./actions";
import { isDue, momentForInput } from "./describe";
import { ScheduleRow } from "./schedule-form";

/**
 * Scheduled publishing: the posts that will go live on a moment, and the button that makes a due
 * moment true.
 *
 * On the server, holding the session, so what is listed is the rule's answer for this person rather
 * than everything filtered in the browser afterwards. `canWrite` is that same answer again, and it is
 * not decoration: it is the value the action checks again, so a session that could not update a post
 * sees no schedule form and no move or cancel.
 *
 * Reading this page publishes nothing. The run is behind a button rather than behind the render,
 * because a page that changes a post as a side effect of being looked at is a write nobody asked
 * for, and the count under the button is what tells a person there is work waiting.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireDemoSession({ returnTo: "/shell/schedule" });
  const [schedules, drafts, query] = await Promise.all([
    // A post that is not there and a post this session may not read are the same answer to a request
    // for this page, and a 500 for a role the rule has not heard of would be a worse answer than an
    // empty one. The refusal is enforced on the actions, which is where a caller can be told what it
    // was refused; a page has no caller to tell.
    listPostSchedules(session).catch(() => {
      notFound();
    }),
    listSchedulablePosts(session).catch(() => {
      notFound();
    }),
    searchParams,
  ]);

  const canWrite = demoCan(session, "posts.update");
  const now = demoNow().getTime();
  const refused = firstValue(query.refused);
  const waiting = schedules.filter((entry) => entry.schedule.state === "pending");
  const due = waiting.filter((entry) => isDue(entry.schedule.publish_at, now));
  const publishedHere = schedules.filter((entry) => entry.schedule.state === "published").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Scheduled publishing</h1>
        <p className="mt-1 text-sm text-zinc-500">
          A scheduled publish is the publish an editor would make by hand, at a moment they choose
          instead of now. It goes live on the run, and it lands in the post&apos;s history like any
          other publish.
        </p>
      </header>

      {refused ? <AdminBanner tone="danger" title="That was refused" body={refused} /> : null}

      <AdminSurfaceCard>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Due now</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {due.length === 0
              ? "Nothing is due. A schedule waits for its moment, and nothing publishes before it."
              : `${due.length} of ${waiting.length} waiting ${due.length === 1 ? "schedule is" : "schedules are"} due.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <form action={runDuePublishesAction}>
            <button
              type="submit"
              disabled={!canWrite || due.length === 0}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-50"
            >
              Publish what is due
            </button>
          </form>
          <p className="text-sm text-zinc-500">
            {publishedHere === 0
              ? "Nothing has gone live on a run yet."
              : `${publishedHere} ${publishedHere === 1 ? "post has" : "posts have"} gone live on a run.`}
          </p>
        </div>
      </AdminSurfaceCard>

      <AdminSurfaceCard>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Schedules</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Waiting moments first, in the order they will fire. Times are UTC, as they are in the
            history.
          </p>
        </div>
        {schedules.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title="Nothing scheduled"
              body="Choose a moment below, and the post will go live on the run after it."
            />
          </div>
        ) : (
          <ul className="divide-y divide-admin-border">
            {schedules.map((entry) => (
              <ScheduleRow
                key={entry.schedule.id}
                schedule={entry.schedule}
                postTitle={titleOf(entry)}
                now={now}
                canWrite={canWrite}
              />
            ))}
          </ul>
        )}
      </AdminSurfaceCard>

      <AdminSurfaceCard>
        <div className="border-b border-admin-border bg-admin-surface-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Schedule a draft</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A draft with a moment chosen. It stays a draft until then, and the history says the
            publish happened on a run rather than by hand.
          </p>
        </div>
        {drafts.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title="No draft to schedule"
              body="Every post is already live, or every draft already has a moment chosen."
            />
          </div>
        ) : (
          <ul className="divide-y divide-admin-border">
            {drafts.map((post) => (
              <li key={post.id} className="flex flex-wrap items-end gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{post.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {post.body.trim() === ""
                      ? "No content yet, and a publish with nothing in it is refused. Write the body first."
                      : `Draft · ${post.id}`}
                  </p>
                </div>
                {canWrite ? <ScheduleDraftForm postId={post.id} suggested={suggestedMoment(now)} /> : null}
              </li>
            ))}
          </ul>
        )}
        {!canWrite ? (
          <p className="border-t border-admin-border px-5 py-3 text-sm text-zinc-500">
            This session may read the schedules and not set one.
          </p>
        ) : null}
      </AdminSurfaceCard>
    </div>
  );
}

/**
 * A form that sets a moment, as a server action rather than as a client component.
 *
 * There is nothing to hold in the browser: the field's value and the post are the whole of what the
 * action needs, and a plain form needs no JavaScript to arrive at the server. The button is disabled
 * on a draft with no content because the run would refuse it, and a control that always fails is a
 * control that lies.
 */
function ScheduleDraftForm({ postId, suggested }: { postId: string; suggested: string }) {
  return (
    <form action={schedulePostAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="post_id" value={postId} />
      <div>
        <label htmlFor={`publish_at-${postId}`} className="block text-xs font-medium text-zinc-700">
          Go live at (UTC)
        </label>
        <AdminInput
          id={`publish_at-${postId}`}
          name="publish_at"
          type="datetime-local"
          defaultValue={suggested}
          required
        />
      </div>
      <button
        type="submit"
        className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Schedule
      </button>
    </form>
  );
}

/** The post a schedule is for, or a statement that it is not there, rather than a blank cell. */
function titleOf(entry: ScheduledPublish): string {
  return entry.post ? entry.post.title : `A post that is no longer there (${entry.schedule.post_id})`;
}

/** An hour out, which is a moment somebody can still read as "later" rather than as "now". */
function suggestedMoment(now: number): string {
  return momentForInput(new Date(now + 60 * 60 * 1000).toISOString());
}

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? (value[0] ?? null) : null;
}
