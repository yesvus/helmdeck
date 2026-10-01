// SPDX-License-Identifier: MIT
import {
  AdminSelect,
  AdminStatusPill,
  defineAdminResource,
  type AdminResourceFormatter,
  type AdminStatusTone,
} from "@yesvus/helmdeck";
import { CONTENT_RESOURCE, CONTENT_STATUSES, isContentStatus } from "./content-status";

/**
 * The demo's posts, described once for the list and the form.
 *
 * The description is the whole of what the pages know about a post. Neither page renders a title or a
 * status itself, so adding a column is one edit here rather than a table, a form and a detail view
 * that have to be kept in step, and a field the definition does not declare cannot be written through
 * a hand-edited request.
 *
 * Nothing here reads or writes. What a post may hold is beside it in `content-status`, which the
 * server actions import without dragging this view tree along, so the value domain is declared once
 * and the column, the form and the check that refuses an invented status all read the same two values.
 */

/** Published is the settled state and a draft is the unsettled one, in the shared tone vocabulary. */
const STATUS_TONES: Readonly<Record<string, AdminStatusTone>> = {
  published: "success",
  draft: "warning",
};

/**
 * The formatters the columns above name, and the page passes to the list.
 *
 * Exported rather than kept private because the code and the names have to meet somewhere: a
 * definition that says `format: { name: "status" }` is a promise the client keeps, and this is the
 * half that keeps it.
 */
export const contentFormatters: Readonly<Record<string, AdminResourceFormatter>> = {
  // The pill is presentation. The word in it is the stored value, because a label invented here
  // would be a second thing on the page to disagree with the row it sits in.
  status: (value) => (
    <AdminStatusPill
      tone={typeof value === "string" ? (STATUS_TONES[value] ?? "neutral") : "neutral"}
      label={typeof value === "string" && value !== "" ? value : "No status"}
    />
  ),
  preview: (value) => preview(value),
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
    // Both columns name a format rather than carrying one. This page is a client component, so it
    // could hold the code, but the names are what make the definition a description the actions and
    // the routes can read on the server too, which is the same reason a column's `format` is a name
    // everywhere in the package. The code behind each name is below, and reaches the list through
    // its `formatters` prop.
    { key: "status", header: "Status", format: { name: "status" } },
    { key: "body", header: "Preview", format: { name: "preview" } },
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
