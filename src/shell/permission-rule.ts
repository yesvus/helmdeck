// SPDX-License-Identifier: MIT
import type {
  AdminPermission,
  AdminPermissionsAdapter,
  AdminSession,
} from "../adapters/index.js";

/** The record a permission is about, for a host whose rules decide per record. */
export type AdminPermissionContext = { resourceId?: string };

/**
 * The one function a host writes: may this session perform this permission.
 *
 * Both halves of the admin ask this question and have to get the same answer. The views ask
 * through `AdminPermissionsAdapter`, which reaches the server because a session does not exist in a
 * browser, and the server actions ask where they run. Two functions answering "may this session do
 * this" is how a button comes to render and then fail, or a hidden one whose action succeeds anyway.
 *
 * The session handed in is the one the server resolved, from the cookie and the row behind it.
 * Nothing a browser sent reaches here, so a rule never has to defend itself against its caller.
 */
export type AdminPermissionRule = (
  session: AdminSession,
  permission: AdminPermission,
  context?: AdminPermissionContext,
) => boolean | Promise<boolean>;

/** Resolves the session for the request in flight. The server is the only place this can happen. */
export type AdminSessionResolver = () => AdminSession | null | Promise<AdminSession | null>;

/**
 * Why a decision went the way it did, so a refusal is diagnosable rather than only a no. The
 * reason is for the host; `AdminPermissionDeniedError`'s message is for whoever reads the response.
 */
export type AdminPermissionReason =
  | "allowed"
  | "denied"
  | "no-session"
  | "no-rule"
  | "rule-failed";

export type AdminPermissionDecision = {
  permission: AdminPermission;
  context?: AdminPermissionContext;
  session: AdminSession | null;
  allowed: boolean;
  reason: AdminPermissionReason;
  /** The failure behind `rule-failed`, which is denied rather than allowed. */
  cause?: unknown;
};

const DENIED_WITHOUT_RULE =
  "A permission was decided with no rule to decide it. Denying, because a missing rule must not read " +
  "as permission granted. Pass `rule` to createAdminPermissionCheck, createAdminPermissionGuard, or " +
  "to the rule itself.";

/**
 * The single place a permission is decided. Both the check a view asks through and the guard an
 * action runs come from here, which is what stops the two from answering differently about the
 * same session and the same permission.
 */
async function decide({
  rule,
  session,
  permission,
  context,
}: {
  rule?: AdminPermissionRule;
  session: AdminSession | null;
  permission: AdminPermission;
  context?: AdminPermissionContext;
}): Promise<AdminPermissionDecision> {
  const asked = { permission, context, session };
  if (!rule) {
    if (process.env.NODE_ENV !== "production") console.warn(DENIED_WITHOUT_RULE);
    return { ...asked, allowed: false, reason: "no-rule" };
  }
  if (!session) return { ...asked, allowed: false, reason: "no-session" };
  try {
    const answer = await rule(session, permission, context);
    // Strictly `true`, not merely truthy: a rule is one function answering one boolean, so a value
    // it returned on some other path is not a grant.
    return answer === true
      ? { ...asked, allowed: true, reason: "allowed" }
      : { ...asked, allowed: false, reason: "denied" };
  } catch (cause) {
    // Denied, and the failure travels with the decision rather than a warning here, so a host can
    // report it where it chooses to. A rule that throws is a host fault, not a grant.
    return { ...asked, allowed: false, reason: "rule-failed", cause };
  }
}

/**
 * Whether this session may perform this permission, according to the host's rule.
 *
 * Fails closed, and says so rather than resolving quietly: no rule denies, no session denies, a
 * rule that throws denies, and anything but `true` from a rule denies. A missing rule is the case
 * that matters, because a host that wired the views and forgot the server has not mislaid a
 * permission, it has no authorization at all, and that has to read as a refusal.
 */
export async function evaluateAdminPermission(input: {
  rule?: AdminPermissionRule;
  session: AdminSession | null;
  permission: AdminPermission;
  context?: AdminPermissionContext;
}): Promise<boolean> {
  return (await decide(input)).allowed;
}

/**
 * The body of the server action a host's permission adapter calls.
 *
 * This is the client half's only way to an answer. It is written once and used twice: the server
 * action `AdminPermissionsAdapter` reaches, and anything else on the server that needs the same
 * verdict, which is what keeps a rendered button and a served action from disagreeing.
 *
 * ```ts
 * // lib/permissions.ts
 * export const check = createAdminPermissionCheck({ rule: can, session: currentSession });
 *
 * // app/lib/permission-actions.ts, "use server"
 * export const checkPermission = async (permission: AdminPermission) => check(permission);
 * ```
 */
export function createAdminPermissionCheck({
  rule,
  session,
  onError,
}: {
  rule?: AdminPermissionRule;
  /** How the session for this request is resolved. A failure to resolve it denies. */
  session: AdminSessionResolver;
  /** Called when resolving the session throws, since that reads as nobody signed in. */
  onError?: (cause: unknown) => void;
}): AdminPermissionsAdapter["can"] {
  return async (permission, context) =>
    evaluateAdminPermission({ rule, session: await resolve(session, onError), permission, context });
}

async function resolve(
  session: AdminSessionResolver,
  onError?: (cause: unknown) => void,
): Promise<AdminSession | null> {
  try {
    return (await session()) ?? null;
  } catch (cause) {
    onError?.(cause);
    return null;
  }
}

/** Refused because there is no session. Distinct from a session that may not do this. */
export class AdminUnauthenticatedError extends Error {
  readonly permission: AdminPermission;

  constructor(permission: AdminPermission) {
    super(`No session may ${permission}`);
    this.name = "AdminUnauthenticatedError";
    this.permission = permission;
  }
}

/**
 * Refused by the rule, or refused because there is no rule to ask. The message says what the
 * visitor already knows; `reason` says why, which the browser is not told.
 */
export class AdminPermissionDeniedError extends Error {
  readonly permission: AdminPermission;
  readonly context?: AdminPermissionContext;
  readonly reason: AdminPermissionReason;
  readonly session: AdminSession | null;

  constructor(decision: Omit<AdminPermissionDecision, "allowed">) {
    super(`This session may not ${decision.permission}`);
    this.name = "AdminPermissionDeniedError";
    this.permission = decision.permission;
    this.context = decision.context;
    this.reason = decision.reason;
    this.session = decision.session;
  }
}

/**
 * A guard that returns the session or refuses. Call it at the top of a route, a page or a server
 * action and the effect it protects does not run for a session that may not perform it.
 */
export type AdminPermissionGuard = (
  permission: AdminPermission,
  context?: AdminPermissionContext,
) => Promise<AdminSession>;

/**
 * The one check a host writes per route or per action, rather than once per page.
 *
 * The decision is the same one the views render against, because both go through the same rule on
 * the same server-resolved session. The refusal is a value: `onUnauthenticated` and `onDenied` are
 * where a host redirects a visitor to a login page or answers `403`, and either may throw to
 * interrupt, which is what `redirect` does. A handler that returns instead of throwing still gets
 * the typed error, so the effect is unreachable either way.
 *
 * ```ts
 * export const requireBilling = createAdminPermissionGuard({
 *   rule: can,
 *   session: currentSession,
 *   onUnauthenticated: () => redirect("/login?next=/billing"),
 *   onDenied: ({ permission }) => forbidden(`This session may not ${permission}`),
 * });
 * ```
 */
export function createAdminPermissionGuard({
  rule,
  session,
  onUnauthenticated,
  onDenied,
  onError,
}: {
  rule?: AdminPermissionRule;
  session: AdminSessionResolver;
  /** Answers a request with no session. Returning rather than throwing refuses anyway. */
  onUnauthenticated?: (decision: AdminPermissionDecision) => unknown;
  /** Answers a request the rule refused. Returning rather than throwing refuses anyway. */
  onDenied?: (decision: AdminPermissionDecision) => unknown;
  onError?: (cause: unknown) => void;
}): AdminPermissionGuard {
  return async (permission, context) => {
    const decision = await decide({ rule, session: await resolve(session, onError), permission, context });
    if (decision.session && decision.allowed) return decision.session;
    if (decision.session) onDenied?.(decision);
    else onUnauthenticated?.(decision);
    throw decision.session
      ? new AdminPermissionDeniedError(decision)
      : new AdminUnauthenticatedError(permission);
  };
}
