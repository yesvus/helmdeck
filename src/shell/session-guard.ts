// SPDX-License-Identifier: MIT
import type { AdminSession } from "../adapters/index.js";
import type { AdminSessionResolver } from "./permission-rule.js";

/**
 * The half of a session guard that runs where the session is: a server component, a route handler
 * or a server action. There is no `"use client"` here and no framework import, so a host can
 * refuse a request from any of the three with one call.
 *
 * The session comes from the host's own resolver, never from a cookie this package reads, because
 * a session is a host concept: a token in a header, a row keyed by a device, a mobile store. The
 * refusal is the host's too, for the same reason the permission guard hands back its answer
 * rather than an exception of the package's own making.
 */

/** Why the read went the way it did, so a refusal is diagnosable rather than only a no. */
export type AdminSessionReason = "authenticated" | "no-session" | "session-failed";

export type AdminSessionDecision = {
  session: AdminSession | null;
  reason: AdminSessionReason;
  /** The failure behind `session-failed`, which is refused rather than treated as anonymous. */
  cause?: unknown;
};

/**
 * What a guard hands `onUnauthenticated`. The URL is already built, because building it is where
 * the destination is validated and a host that assembled it from an unvalidated `returnTo` would
 * redirect off-origin. The reason rides along so a host can answer a visitor and an outage
 * differently.
 */
export type AdminSessionRefusal = AdminSessionDecision & {
  session: null;
  /** The sign-in URL, carrying the validated destination in `next`. */
  loginHref: string;
  /** The destination after validation: the host's `returnTo`, or the root. */
  returnTo: string;
};

export const DEFAULT_ADMIN_LOGIN_HREF = "/admin/login";

/**
 * Control characters, refused because a URL parser strips them before resolving, so
 * "/%0D%0A/evil.example" passes every other check below and still resolves to another origin.
 */
// eslint-disable-next-line no-control-regex -- the point is to reject these, not to match them
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/**
 * A destination is usable only if every layer of encoding in it is still a plain same-site path.
 * Root-relative, not protocol-relative, and free of backslashes, which several browsers
 * normalise into a host separator.
 */
function isSameSitePath(value: string): boolean {
  if (CONTROL_CHARACTERS.test(value)) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return !value.includes("\\");
}

/**
 * The destination a guard recorded, read back off a sign-in page. Anything that is not a plain
 * same-site path is rejected: this value comes from a query string, so without the check a
 * crafted link would turn the sign-in page into an open redirect that hands a visitor to another
 * origin immediately after authenticating.
 *
 * Encoded layers are peeled as well, because a host that decodes before redirecting would
 * otherwise turn "/%2F%2Fevil.example" back into "//evil.example".
 */
export function adminReturnTo(search: URLSearchParams | null | undefined): string | null {
  return readDestination(search?.get("next"));
}

/**
 * One set of rules for a destination, wherever it was read. A guard that checked a `returnTo`
 * by a laxer rule than the sign-in page reads its own output with would write a destination its
 * own reader refuses, and would hand a decoding host one that leaves the origin.
 */
function readDestination(raw: string | null | undefined): string | null {
  if (!raw || !isSameSitePath(raw)) return null;

  let current = raw;
  for (let round = 0; round < 3; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      // A malformed escape is not a path anyone meant to visit.
      return null;
    }
    if (decoded === current) return current;
    if (!isSameSitePath(decoded)) return null;
    current = decoded;
  }
  // Still changing after three rounds, so the value is obfuscated past the point of being read
  // safely. Refuse rather than guess which layer was meant.
  return null;
}

/** A destination a host supplied is only a destination if it stays on the origin. */
function validatedDestination(returnTo: string | null | undefined): string {
  return readDestination(returnTo) ?? "/";
}

/**
 * Attaches the preserved destination to a sign-in URL, keeping any query the host already put
 * there. A second "?" would be malformed, and a host carrying a tenant or return flag in its
 * sign-in URL is an ordinary case rather than an exotic one.
 *
 * `returnTo` is validated here rather than by the caller, because this is the one place a
 * destination becomes a link somebody follows, and a host that read a `returnTo` off its own URL
 * would otherwise redirect a visitor to another origin.
 */
function withNext(loginHref: string, returnTo: string): string {
  // Split the fragment off first. Left in place, a sign-in URL ending in "#section" would
  // swallow the query into the fragment and the destination would be lost.
  const hashAt = loginHref.indexOf("#");
  const fragment = hashAt === -1 ? "" : loginHref.slice(hashAt);
  const withoutFragment = hashAt === -1 ? loginHref : loginHref.slice(0, hashAt);

  const queryAt = withoutFragment.indexOf("?");
  const base = queryAt === -1 ? withoutFragment : withoutFragment.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : withoutFragment.slice(queryAt + 1));
  params.set("next", returnTo);
  return `${base}?${params.toString()}${fragment}`;
}

/** The sign-in URL for a destination, for a host that redirects from its own code. */
export function adminLoginHref(
  loginHref: string,
  returnTo: string | null | undefined = "/",
): string {
  return withNext(loginHref, validatedDestination(returnTo));
}

/**
 * The single place a session is read, so the page, the handler and the action cannot disagree
 * about who is signed in. A read that throws is refused rather than reported as an absent
 * session, which is the same reasoning the browser half uses: bouncing a signed-in visitor to the
 * sign-in page on every transient failure is worse than saying so.
 */
async function decide(
  session: AdminSessionResolver,
  onError?: (cause: unknown) => void,
): Promise<AdminSessionDecision> {
  try {
    const resolved = (await session()) ?? null;
    return resolved
      ? { session: resolved, reason: "authenticated" }
      : { session: null, reason: "no-session" };
  } catch (cause) {
    onError?.(cause);
    return { session: null, reason: "session-failed", cause };
  }
}

/**
 * The session for this request, or `null`. The non-refusing half: a route handler that answers 401
 * and a page that redirects want the same read, and a host should not have to catch an exception
 * to get the one that does not redirect.
 *
 * ```ts
 * // app/billing/route.ts
 * const session = await readAdminSession({ session: currentSession });
 * if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
 * ```
 */
export async function readAdminSession({
  session,
  onError,
}: {
  session: AdminSessionResolver;
  onError?: (cause: unknown) => void;
}): Promise<AdminSession | null> {
  return (await decide(session, onError)).session;
}

/** Refused because a route needed a session and there was none. The message names no reason. */
export class AdminSessionRequiredError extends Error {
  readonly reason: AdminSessionReason;
  readonly returnTo: string;
  readonly loginHref: string;

  constructor(refusal: AdminSessionRefusal) {
    super("This route requires a session", { cause: refusal.cause });
    this.name = "AdminSessionRequiredError";
    this.reason = refusal.reason;
    this.returnTo = refusal.returnTo;
    this.loginHref = refusal.loginHref;
  }
}

/**
 * A guard that returns the session or refuses. Call it at the top of a page, a route or a server
 * action and the work behind it does not run for a visitor with no session.
 */
export type AdminSessionGuard = (options?: {
  /** Where the visitor was headed, validated before it reaches a redirect. */
  returnTo?: string;
  /** Overrides the sign-in URL the factory was built with. */
  loginHref?: string;
}) => Promise<AdminSession>;

/**
 * The one check a host writes per route, rather than once per page. Wire it once where the
 * session is resolved and name it `requireAdminSession`, so a route reads as one call:
 *
 * ```ts
 * // lib/session.ts
 * export const requireAdminSession = createAdminSessionGuard({
 *   session: currentSession,
 *   onUnauthenticated: ({ loginHref }) => redirect(loginHref),
 * });
 *
 * // app/billing/page.tsx
 * const session = await requireAdminSession({ returnTo: "/admin/billing" });
 * ```
 *
 * The refusal is the host's: `onUnauthenticated` is where a page redirects and where a handler
 * answers 401, and either may throw to interrupt, which is what `redirect` does. A handler that
 * returns instead of throwing still gets `AdminSessionRequiredError`, so the work behind the
 * guard is unreachable either way.
 */
export function createAdminSessionGuard({
  session,
  onUnauthenticated,
  loginHref = DEFAULT_ADMIN_LOGIN_HREF,
  onError,
}: {
  session: AdminSessionResolver;
  /** Answers a request with no session. Returning rather than throwing refuses anyway. */
  onUnauthenticated?: (refusal: AdminSessionRefusal) => unknown;
  /** The sign-in URL a refusal offers, unless a call overrides it. */
  loginHref?: string;
  onError?: (cause: unknown) => void;
}): AdminSessionGuard {
  return async (options = {}) => {
    const decision = await decide(session, onError);
    if (decision.session) return decision.session;

    const returnTo = validatedDestination(options.returnTo);
    const refusal: AdminSessionRefusal = {
      ...decision,
      session: null,
      returnTo,
      loginHref: withNext(options.loginHref ?? loginHref, returnTo),
    };
    onUnauthenticated?.(refusal);
    throw new AdminSessionRequiredError(refusal);
  };
}
