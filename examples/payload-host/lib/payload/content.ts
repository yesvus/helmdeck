// SPDX-License-Identifier: MIT
/**
 * The one path from this host's server code into Payload's data.
 *
 * Every read and every write goes through the package's bridge, which always passes
 * `overrideAccess: false` and the session's user. Those two are the whole of what makes a Local API
 * call permission-checked: Payload's `overrideAccess` **defaults to `true`**, so a call that
 * forgets it reads and writes with no access control at all and behaves exactly as though it were
 * correct. There is no error, no warning and no log line for the omission.
 *
 * So both are passed here, together, in one module, rather than at each call site. A call site
 * that remembered one of them is a call site that silently has no permission check, and the only
 * defence against that is there being nowhere else to make the call from.
 *
 * A request with no session is refused before it reaches Payload, because a session that cannot be
 * read as an account is not an anonymous account, it is a request that must not be answered.
 */

import { createAdminPayloadContent } from "@yesvus/helmdeck";
import type { AdminPayloadContent } from "@yesvus/helmdeck";
import { getPayload } from "payload";
import config from "../../payload.config";
import { readPayloadSession } from "../session";

/** The collection the content lives in. */
export const PAGES = "pages";

/**
 * A page, as this host reads it.
 *
 * The bridge answers in `unknown`, because the package does not know what a host's collections
 * hold. The shape is settled here, in the one module that talks to Payload, so a page read
 * anywhere in this host has one type and one place where it was narrowed.
 */
export type PageDocument = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  updatedAt?: string | null;
};

let pending: Promise<AdminPayloadContent> | null = null;

/**
 * The content, and the only way to reach it.
 *
 * The bridge is built once and holds no request state: the session is resolved per call, so the
 * same object is correct for every request the process serves.
 */
export function payloadContent(): Promise<AdminPayloadContent> {
  pending ??= (async () => {
    const payload = await getPayload({ config });
    return createAdminPayloadContent({ payload, resolveUser: readPayloadSession });
  })().catch((cause) => {
    // A failed start is not remembered. A database that was briefly unreachable would otherwise
    // fail every later request until the process was restarted.
    pending = null;
    throw cause;
  });
  return pending;
}

/**
 * The documents, narrowed to the shape above.
 *
 * `docs` is what Payload answers with, and it is what the count and the rows both arrive in.
 */
function readDocs(result: unknown): PageDocument[] {
  if (!result || typeof result !== "object") return [];
  const docs = (result as { docs?: unknown }).docs;
  if (!Array.isArray(docs)) return [];
  return docs as PageDocument[];
}

/** How many documents the collection holds, for the dashboard's count. */
export async function countPages(): Promise<number> {
  const content = await payloadContent();
  const result = await content.find(PAGES, { limit: 1, depth: 0, draft: true });
  const total = (result as { totalDocs?: unknown } | null)?.totalDocs;
  return typeof total === "number" ? total : 0;
}

/**
 * The documents, most recently changed first.
 *
 * Drafts are included, because the collection keeps them and a shell that counted only the
 * published ones would report a smaller number than the editor holds. The published view is a
 * query of its own, and a host that wants it filters on the status.
 */
export async function listPages(limit = 50): Promise<PageDocument[]> {
  const content = await payloadContent();
  const result = await content.find(PAGES, { limit, depth: 0, sort: "-updatedAt", draft: true });
  return readDocs(result);
}
