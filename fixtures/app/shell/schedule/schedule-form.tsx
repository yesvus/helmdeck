// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminBanner, AdminField, AdminInput, Button } from "@yesvus/helmdeck";
import type { PostSchedule } from "../../../lib/demo-scheduling";
import { cancelScheduleAction, moveScheduleAction } from "./actions";
import { formatWhen, isDue, momentForInput, stateLabels } from "./describe";

/**
 * One post's schedule, and the two things a person can do to a promise that has not been kept yet.
 *
 * A move and a cancel, and no publish: the moment is what this row is about, and a post is published
 * by `publishPost` and by nothing else. A schedule for a post that is already live is not shown at
 * all, because the run refuses it and a control that always fails is a control that lies.
 *
 * `canWrite` is the rule's own answer for this session, passed down from the page, so a button that
 * is not rendered here is also an action the server refuses. The action checks it again either way.
 */
export function ScheduleRow({
  schedule,
  postTitle,
  now,
  canWrite,
}: {
  schedule: PostSchedule;
  postTitle: string;
  now: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [moment, setMoment] = useState(() => momentForInput(schedule.publish_at));

  async function run(name: string, work: () => Promise<unknown>) {
    setError(undefined);
    setPending(name);
    try {
      await work();
      // The list is server-rendered, so a fresh answer is what puts the new state in it.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(undefined);
    }
  }

  const blocked = pending !== undefined;
  const waiting = schedule.state === "pending";
  const due = waiting && isDue(schedule.publish_at, now);

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-zinc-900">{postTitle}</p>
        <p className="text-xs text-zinc-500">
          {stateLabels[schedule.state]}
          {waiting ? ` · ${formatWhen(schedule.publish_at)}` : ""}
          {schedule.state !== "unknown" && !waiting && schedule.settled_at
            ? ` · ${formatWhen(schedule.settled_at)}`
            : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Set by {schedule.actor_email}
        {schedule.actor_role ? ` (${schedule.actor_role})` : ""} · {schedule.id}
      </p>
      {due ? (
        <p className="mt-1 text-xs font-medium text-amber-700">
          Due now. It goes live on the next run, not before.
        </p>
      ) : null}
      {schedule.last_refusal ? (
        <p className="mt-1 text-xs text-red-600">Last run: {schedule.last_refusal}</p>
      ) : null}

      {error ? <AdminBanner tone="danger" title="That was refused" body={error} /> : null}

      {canWrite && waiting ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <AdminField label="Go live at (UTC)" id={`move-${schedule.id}`}>
            <AdminInput
              id={`move-${schedule.id}`}
              type="datetime-local"
              value={moment}
              disabled={blocked}
              onChange={(event) => setMoment(event.target.value)}
            />
          </AdminField>
          <Button
            variant="outline"
            size="sm"
            disabled={blocked || moment === "" }
            onClick={() => void run("move", () => moveScheduleAction({ scheduleId: schedule.id, publishAt: moment }))}
          >
            {busyLabel(pending, "move", "Moving…", "Move")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={blocked}
            onClick={() => void run("cancel", () => cancelScheduleAction(schedule.id))}
          >
            {busyLabel(pending, "cancel", "Cancelling…", "Cancel")}
          </Button>
        </div>
      ) : null}
      {!canWrite && waiting ? (
        <p className="mt-2 text-xs text-zinc-500">This session may read the schedule and not change it.</p>
      ) : null}
    </li>
  );
}

function busyLabel(pending: string | undefined, name: string, busy: string, idle: string): string {
  return pending === name ? busy : idle;
}
