// SPDX-License-Identifier: MIT
/**
 * Whether a widget's failure is worth offering the operator a retry for.
 *
 * A retry button is a promise: press it and the thing you were looking at comes back. A refusal that
 * cannot be retried away — no permission, no session, a missing configuration — makes that promise a
 * lie, and a control that can only fail is worse than no control: it costs the operator a click and
 * teaches them that the button does not work.
 *
 * **This decides by what the error is, not by what happened.** A database that was briefly unreachable
 * and a permission that was never granted both arrive as an `Error` on the same state, and nothing in
 * the state distinguishes them. So the distinction is made where the refusal is raised, by the code
 * that knows, and read back here.
 */
import { AdminPermissionDeniedError, AdminUnauthenticatedError } from "../shell/permission-rule.js";
import { AdminTenantError } from "../baseline/tenant-core.js";

/**
 * A failure that repeating the same request cannot fix.
 *
 * **Thrown by the code that knows the answer, not inferred by this package.** A caller catching one is
 * told to stop retrying and to change what the request is: a different session, a permission that has
 * been granted, a tenant that has been named. It extends `Error`, so existing handlers still work, and
 * nothing that reads an `Error` needs to know this exists.
 */
export class AdminWidgetPermanentError extends Error {
  /** What the operator should do instead of retrying, shown beside the message. */
  readonly remedy: string;

  constructor(message: string, remedy: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AdminWidgetPermanentError";
    this.remedy = remedy;
  }
}

/**
 * Whether a widget's failure is worth offering the operator a retry for.
 *
 * **The errors this package already raises for a refusal are read, not only the new one.** A widget that
 * reads through the package's own permission rule gets `AdminPermissionDeniedError` without knowing this
 * function exists, and retrying that fails identically every time. Listing them here is what makes the
 * default right for a host that has not adopted `AdminWidgetPermanentError` at all, which is every host
 * written before this.
 *
 * Anything not recognised is treated as worth retrying, because the alternative is a widget that shows
 * no way forward for a transient database blip. A host that knows a failure is permanent says so by
 * throwing; a host that does not know gets the safer default rather than a dead end.
 */
export function adminWidgetRetryIsWorthwhile(error: unknown): boolean {
  if (error instanceof AdminWidgetPermanentError) return false;

  // Refused by the rule, or refused because there is no rule to ask. Repeating the request asks the
  // same question of the same rule and gets the same answer.
  if (error instanceof AdminPermissionDeniedError) return false;
  if (error instanceof AdminUnauthenticatedError) return false;

  // A store configured for tenancy refused an unscoped call. The fix is to resolve the tenant, and the
  // next attempt from the same place resolves it the same absent way.
  if (error instanceof AdminTenantError) return false;

  return true;
}
