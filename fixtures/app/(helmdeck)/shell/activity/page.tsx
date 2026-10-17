// SPDX-License-Identifier: MIT
import { AdminActivityPage } from "@yesvus/helmdeck";
import { listActivityEventsAction } from "./actions";

/**
 * The activity trail, mounted as the route it is.
 *
 * The component is given the loader rather than a list of events, so the filter a reader chooses is
 * applied on the server against the trail's own table rather than in the browser after everything was
 * fetched. The rule is named once, here, so the page and the read behind it are asking the same
 * question.
 */
export default function ActivityPage() {
  return (
    <AdminActivityPage
      load={listActivityEventsAction}
      actions={["create", "update", "delete"]}
      permission="activity.read"
    />
  );
}