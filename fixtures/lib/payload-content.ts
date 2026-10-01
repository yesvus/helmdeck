// SPDX-License-Identifier: MIT

/**
 * The only path from helmdeck's server code into Payload's data.
 *
 * Every call passes `overrideAccess: false` and a `user`. Those two are the whole of what makes a
 * Local API call permission-checked: Payload's `overrideAccess` **defaults to `true`**, so a call that
 * forgets it reads and writes with no access control at all and behaves exactly as though it were
 * correct. There is no error, no warning and no log line for the omission. Passing a `user` alone does
 * nothing either, because with access control switched off there is nothing to check it against.
 *
 * So both are passed here, together, in one module, rather than at each call site. A call site that
 * remembered one of them is a call site that silently has no permission check, and the only defence
 * against that is there being nowhere else to make the call from.
 *
 * `demoPayloadUser` refuses rather than defaulting. A session that cannot be read as a principal is
 * not an anonymous principal, it is a request that must not be answered, and the caller here throws
 * rather than passing `null` to let Payload decide, because Payload decides by asking an access
 * function and a host that forgot to write one answers permissively.
 */

import type { Payload } from "payload";
import { payloadUserFor, type DemoPrincipal, type PayloadUser } from "./payload-accounts";
import { resolveDemoPrincipal } from "./payload-auth-strategy";

/** The collection Payload's content lives in, named once so a typo cannot half-apply. */
export const PAYLOAD_PAGES = "demo-pages";

/** A refusal, thrown rather than returned, so a caller cannot read a failed write as an empty result. */
export class PayloadAccessRefused extends Error {
  constructor(operation: string) {
    super(`Payload ${operation} refused: no demo session resolved to a principal`);
    this.name = "PayloadAccessRefused";
  }
}

/**
 * The current request's demo session, as a Payload user.
 *
 * Throws when there is no session. This is the function every operation here calls first, and it is
 * the reason a call made without a session never reaches Payload at all: the refusal happens here
 * rather than inside Payload, where the caller would have to read an exception to discover that the
 * permission check it forgot to enable was never going to run.
 */
export async function demoPayloadUser(): Promise<PayloadUser> {
  const principal = await resolveDemoPrincipal();

  if (!principal) throw new PayloadAccessRefused("operation");

  return payloadUserFor(principal);
}

/** As above, for a caller that already resolved the session and holds the principal. */
export function payloadUserForPrincipal(principal: DemoPrincipal): PayloadUser {
  return payloadUserFor(principal);
}

/**
 * Every document in Payload's content, for a signed-in editor.
 *
 * `limit` is Payload's own page size and `depth: 0` stops it populating relationships, which a list
 * of titles does not need and which costs a query per row.
 */
export async function listPayloadPages(payload: Payload) {
  const user = await demoPayloadUser();

  return payload.find({
    collection: PAYLOAD_PAGES,
    overrideAccess: false,
    user,
    limit: 50,
    depth: 0,
    sort: "-updatedAt",
  });
}

/** One document, or null when there is none or the caller may not read it. */
export async function readPayloadPage(payload: Payload, id: string) {
  const user = await demoPayloadUser();

  return payload.findByID({
    id,
    collection: PAYLOAD_PAGES,
    overrideAccess: false,
    user,
    depth: 0,
    disableErrors: true,
  });
}

/**
 * A document, created by a signed-in editor.
 *
 * Refuses an editor who may not write, which the demo's rule already says, so the refusal here is
 * Payload asking the access function in `payload-access` rather than this module deciding.
 */
export async function createPayloadPage(
  payload: Payload,
  data: { title: string; slug: string; summary?: string; richText: unknown },
) {
  const user = await demoPayloadUser();

  return payload.create({
    collection: PAYLOAD_PAGES,
    data,
    overrideAccess: false,
    user,
    depth: 0,
  });
}

/** A document, changed by whoever may change it. */
export async function updatePayloadPage(
  payload: Payload,
  id: string,
  data: { title?: string; summary?: string; richText?: unknown },
) {
  const user = await demoPayloadUser();

  return payload.update({
    id,
    collection: PAYLOAD_PAGES,
    data,
    overrideAccess: false,
    user,
    depth: 0,
  });
}

/**
 * A document, deleted by whoever may delete it.
 *
 * Present so the boundary can be demonstrated with an operation the demo's rule actually refuses. An
 * editor may create, read and update but not delete, so this call with a resolved editor session is the
 * one that shows `overrideAccess: false` is doing work: drop it and the delete succeeds.
 */
export async function deletePayloadPage(payload: Payload, id: string) {
  const user = await demoPayloadUser();

  return payload.delete({
    id,
    collection: PAYLOAD_PAGES,
    overrideAccess: false,
    user,
  });
}