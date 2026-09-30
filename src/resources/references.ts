// SPDX-License-Identifier: MIT

import type { AdminPersistenceAdapter } from "../adapters/index.js";
import { adminResourceQuery } from "../adapters/query.js";
import {
  adminResourceRecordId,
  adminResourceReferenceValue,
  type AdminResourceRecord,
  type AdminResourceReference,
} from "./registry.js";

/**
 * How many rows one reference offers as choices.
 *
 * A window rather than everything, because a foreign key into a table of records nobody is going to
 * scroll through is a control that would hang the page. What the store reported past the window is
 * carried beside the rows, so a view can say the list it is offering is a window rather than the
 * whole set, which is the claim that would otherwise be false.
 */
export const ADMIN_RESOURCE_REFERENCE_LIMIT = 100;

/** The rows one reference offers, and whether this session may read the resource they come from. */
export type AdminResourceReferenceChoices = {
  /** What the store answered, in the order it sent them. */
  rows: AdminResourceRecord[];
  /** What the store says it matched, when it said. Null for a store that does not count. */
  total: number | null;
  /**
   * False when the read was refused or failed, which are the same answer to a form: a choice this
   * package cannot vouch for is not offered. Fails closed, and without asking which error came back,
   * because an error's class does not survive every seam a reference is read across.
   */
  available: boolean;
};

const NO_CHOICES: AdminResourceReferenceChoices = { rows: [], total: null, available: false };

/**
 * The rows a reference offers, asked of the store the view was handed.
 *
 * The one question the form and the list both ask about a reference, asked through the same call and
 * the same window, which is what keeps the two halves from answering "which rows may this session
 * choose from" in two different ways. It is a plain read of the target resource, so it is refused by
 * whatever guards reads of that resource, and a reference to a resource this session may not read
 * offers nothing rather than offering it.
 *
 * An adapter with no `queryPage` is asked for its rows, as everywhere else in this contract, and the
 * window is applied here rather than asked for. The count is then null rather than the length of what
 * came back, because a store that did not count has made no claim about the size of the set.
 *
 * The cause of a failure is handed to `onError` where the caller has one, and the answer to the view
 * is the same either way: a refused read and a broken one both mean no choices.
 */
export async function adminResourceReferenceChoices(
  persistence: AdminPersistenceAdapter,
  reference: AdminResourceReference,
  limit: number = ADMIN_RESOURCE_REFERENCE_LIMIT,
  onError?: (cause: unknown) => void,
): Promise<AdminResourceReferenceChoices> {
  // Clamped rather than refused, as a list's page size is: this is a host's own prop, and a bad one
  // belongs in the host's build rather than in the control a visitor is looking at.
  const size = Math.max(1, Math.trunc(limit) || ADMIN_RESOURCE_REFERENCE_LIMIT);
  try {
    if (typeof persistence.queryPage === "function") {
      const page = await persistence.queryPage<AdminResourceRecord>(
        reference.resource,
        adminResourceQuery().window(0, size).build(),
      );
      return { rows: usable(page.rows), total: page.total, available: true };
    }
    const found = await persistence.query<AdminResourceRecord>(reference.resource);
    return { rows: usable(found.slice(0, size)), total: null, available: true };
  } catch (cause) {
    onError?.(cause);
    return NO_CHOICES;
  }
}

/** A row with no usable id cannot be chosen, so it is not offered as though it could be. */
function usable(rows: AdminResourceRecord[]): AdminResourceRecord[] {
  return rows
    .map((row) => {
      try {
        return { ...row, id: adminResourceRecordId(row) };
      } catch {
        return null;
      }
    })
    .filter((row): row is AdminResourceRecord => row !== null);
}

/**
 * The text a target row is read by, which is the label field a declaration names or the id.
 *
 * A target row whose named label is empty prints its id, because a choice with no text is not a
 * choice a person can tell apart, and the id is the one value the row certainly has.
 */
export function adminResourceReferenceLabel(
  row: AdminResourceRecord,
  reference: AdminResourceReference,
): string {
  const declared = reference.label === undefined ? row.id : row[reference.label];
  return adminResourceReferenceValue(declared) ?? row.id;
}

/** One value on a page, and the row of which resource it names. */
export type AdminResourceReferenceRequest = {
  reference: AdminResourceReference;
  value: string;
};

/**
 * What resolving one value found: the row, or the two things that are not a row.
 *
 * `missing` and `unreadable` are kept apart on purpose. A value this session may not resolve has not
 * been shown not to exist, and a page that claimed it had would be making a claim about another
 * resource's rows to a visitor not allowed to know them.
 */
export type AdminResourceReferenceResolution =
  | { state: "named"; row: AdminResourceRecord }
  | { state: "missing" }
  | { state: "unreadable" };

/**
 * A value's own key in a resolution map.
 *
 * The resource is part of the key because two resources may hold the same id, and a value on a
 * column is only known to name a row once its own declaration has said which resource that is.
 */
export function adminResourceReferenceKey(
  reference: AdminResourceReference,
  value: string,
): string {
  return JSON.stringify([reference.resource, value]);
}

/**
 * The rows the values on a page name, resolved one hop each.
 *
 * One hop and never a walk, which is what makes a self-referencing column terminate: a cell needs the
 * label of the row it names and nothing at all about that row's own references, so
 * `customers.parent_id` resolves to the parent's name without ever looking at the parent's parent.
 * A host that wants a path rather than a name writes a formatter, which is where code goes.
 *
 * The requests are deduplicated by key, so a page of forty rows pointing at the same customer asks
 * once. The reads go through the same adapter as everything else, so each one is refused on the
 * server for a target this session may not read rather than being answered and then hidden.
 */
export async function adminResourceReferenceResolution(
  persistence: AdminPersistenceAdapter,
  requests: readonly AdminResourceReferenceRequest[],
  onError?: (cause: unknown) => void,
): Promise<Map<string, AdminResourceReferenceResolution>> {
  const resolutions = new Map<string, AdminResourceReferenceResolution>();
  const wanted = new Map<string, AdminResourceReferenceRequest>();
  for (const request of requests) {
    wanted.set(adminResourceReferenceKey(request.reference, request.value), request);
  }
  await Promise.all(
    [...wanted.values()].map(async (request) => {
      const key = adminResourceReferenceKey(request.reference, request.value);
      try {
        const row = await persistence.read<AdminResourceRecord>(
          request.reference.resource,
          request.value,
        );
        resolutions.set(key, row === null ? { state: "missing" } : { state: "named", row });
      } catch (cause) {
        onError?.(cause);
        resolutions.set(key, { state: "unreadable" });
      }
    }),
  );
  return resolutions;
}
