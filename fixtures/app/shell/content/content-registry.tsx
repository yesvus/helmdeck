// SPDX-License-Identifier: MIT
import {
  AdminSelect,
  AdminStatusPill,
  defineAdminResource,
  type AdminStatusTone,
} from "@yesvus/helmdeck";

/**
 * The demo's posts, described once for the list and the form.
 *
 * The description is the whole of what the pages know about a post. Neither renders a title or a
 * status itself, so adding a column is one edit here rather than a table, a form and a detail view
 * that have to be kept in step, and a field the definition does not declare cannot be written
 * through a hand-edited request.
 *
 * Nothing here reads or writes, which is what lets the server actions import the value domain below
 * without pulling a component tree in behind it: the statuses are declared once, and the column, the
 * form and the check that refuses an invented one all read them from here.
 */

/** The table the content pages read and write, named once because four modules answer about it. */
export const CONTENT_RESOURCE = "posts";

/**
 * The statuses `posts.status` can hold, in the order the form offers them.
 *
 * This is the column's own domain rather than a host's preference, and `0001_initial.sql` is where it
 * is enforced: the CHECK constraint there refuses anything else, which is a stronger answer than any
 * list a fixture keeps. The server action asks this list too, because the in-memory store the demo
 * falls back to has no constraint to ask, and a demo that stored a status the schema forbids would
 * be showing a value its own database would not accept.
 */
export const CONTENT_STATUSES = ["draft", "published"] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value);
}

/** Published is the settled state and a draft is the unsettled one, in the shared tone vocabulary. */
const STATUS_TONES: Readonly<Record<string, AdminStatusTone>> = {
  published: "success",
  draft: "warning",
};

/**
 * The status control, offering the statuses the column can hold and nothing else.
 *
 * A status is a choice from a fixed set rather than free text, so typing one is how a value the
 * column cannot store gets in. A stored value that is not on the list is offered as well, so a record
 * written by something else is shown as it is rather than replaced with the first option the moment
 * somebody saves an unrelated field.
 */
function statusField(value: unknown, formId: string) {
  const stored = typeof value === "string" ? value : "";
  const options = isContentStatus(stored)
    ? CONTENT_STATUSES
    : [stored, ...CONTENT_STATUSES].filter((option) => option !== "");

  return (
    <AdminSelect id={formId} name="status" defaultValue={stored === "" ? CONTENT_STATUSES[0] : stored}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </AdminSelect>
  );
}

/**
 * The stored body, cut short for a list.
 *
 * The full text is on the form, which is where a person reads a post, so the list shows enough to
 * tell two posts apart. Cut from what the store holds rather than from a summary column, because a
 * summary the demo made up is a number nobody can trace back to a row.
 */
function preview(value: unknown, limit = 80): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length <= limit) return text === "" ? "Empty" : text;
  return `${text.slice(0, limit).trimEnd()}...`;
}

export const contentPosts = defineAdminResource({
  resource: CONTENT_RESOURCE,
  label: "Posts",
  singularLabel: "Post",
  path: "content",
  permissions: {
    read: `${CONTENT_RESOURCE}.read`,
    create: `${CONTENT_RESOURCE}.create`,
    update: `${CONTENT_RESOURCE}.update`,
    delete: `${CONTENT_RESOURCE}.delete`,
  },
  columns: [
    { key: "title", header: "Title" },
    {
      key: "status",
      header: "Status",
      // The pill is presentation. The word in it is the stored value, because a label invented here
      // would be a second thing on the page to disagree with the row it sits in.
      format: (value) => (
        <AdminStatusPill
          tone={typeof value === "string" ? (STATUS_TONES[value] ?? "neutral") : "neutral"}
          label={typeof value === "string" && value !== "" ? value : "No status"}
        />
      ),
    },
    { key: "body", header: "Preview", format: (value) => preview(value) },
  ],
  fields: [
    { name: "title", label: "Title", required: true },
    { name: "body", label: "Body", type: "textarea" },
    {
      name: "status",
      label: "Status",
      required: true,
      render: (value, formId) => statusField(value, formId),
    },
  ],
});
