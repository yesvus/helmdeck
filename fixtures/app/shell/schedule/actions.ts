// SPDX-License-Identifier: MIT
"use server";

import { redirect } from "next/navigation";
import { requireDemoSession } from "../../../lib/demo-guard";
import { demoCan } from "../../../lib/demo-rules";
import {
  cancelSchedule,
  moveSchedule,
  publishDuePosts,
  schedulePost,
  type PostSchedule,
} from "../../../lib/demo-scheduling";

/**
 * The schedule page's server actions.
 *
 * Each resolves the session and hands it to the operation, which asks `demoCan` about the post. The
 * session comes from the cookie's signed id and the role on the user row behind it, so a caller
 * cannot talk this boundary into a different role by posting an argument. There is no check here that
 * the page repeats, because the page is not where authorization is decided.
 *
 * A refusal redirects rather than returning, because a form action's return value never reaches a
 * server component, and a page that silently re-renders is how a refused schedule looks like one that
 * was made. The reason travels in the query because the operation that refused it is the one that
 * knows why.
 */

const RETURN_TO = "/shell/schedule";

function refusal(cause: unknown): never {
  const message = cause instanceof Error ? cause.message : String(cause);
  redirect(`${RETURN_TO}?refused=${encodeURIComponent(message)}`);
}

/** A submitted field as the text it holds, which is what the operation is asked to read. */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The moment a form posts, as a `datetime-local` field holds it: a UTC wall time with no offset. */
export async function schedulePostAction(form: FormData): Promise<void> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  await schedulePost(session, field(form, "post_id"), field(form, "publish_at")).catch(refusal);
  redirect(RETURN_TO);
}

/** A moved schedule, from the row component, which knows its id and the moment now in the field. */
export async function moveScheduleAction(input: {
  scheduleId: string;
  publishAt: string;
}): Promise<PostSchedule> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  const moved = await moveSchedule(session, input.scheduleId, input.publishAt).catch(refusal);
  redirect(RETURN_TO);
  return moved;
}

export async function cancelScheduleAction(scheduleId: string): Promise<PostSchedule> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  const cancelled = await cancelSchedule(session, scheduleId).catch(refusal);
  redirect(RETURN_TO);
  return cancelled;
}

/**
 * Runs the publishes that are due, which is the moment a schedule becomes a published post.
 *
 * The session is asked whether it may update posts before anything is written, because a schedule
 * going live is a write to a post and the rule that governs that write governs pressing this button
 * too. What each run publishes with is that schedule's own recorded actor, decided when it fires, so
 * an account that has since lost the role is refused rather than publishing on the strength of the
 * role it held when the moment was set.
 */
export async function runDuePublishesAction(): Promise<void> {
  const session = await requireDemoSession({ returnTo: RETURN_TO });
  if (!demoCan(session, "posts.update")) {
    refusal(new Error("This session may not update posts"));
  }
  await publishDuePosts();
  redirect(RETURN_TO);
}
