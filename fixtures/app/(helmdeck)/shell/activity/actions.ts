// SPDX-License-Identifier: MIT
"use server";

import { requireDemoSession } from "../../../../lib/demo-guard";
import { listActivityEvents, type ActivityFilter } from "../../../../lib/demo-activity";

/**
 * The activity trail's read action.
 *
 * One action, and the filter comes from the browser as an argument rather than as a query the action
 * trusts: what it does with it is decided in `demo-activity`, where the rule is asked and the trail's
 * own table is read. A caller naming an action the trail does not hold gets nothing rather than
 * everything.
 */
export async function listActivityEventsAction(filter: ActivityFilter = {}) {
  const session = await requireDemoSession({ returnTo: "/shell/activity" });
  return listActivityEvents(session, filter);
}