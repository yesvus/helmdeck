// SPDX-License-Identifier: MIT
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";
import type { AdminAuthAdapter, AdminLoginCredentials, AdminLoginResult, AdminSession } from "../adapters/index.js";
import { useAdminMessages } from "../i18n.js";
import { cn } from "../cn.js";

/**
 * Where the session currently stands. `checking` is the first value, so a guard denies
 * content until the adapter has actually answered rather than flashing the protected tree.
 */
export type AdminSessionStatus = "checking" | "authenticated" | "anonymous" | "error";

export type AdminAuthContextValue = {
  session: AdminSession | null;
  status: AdminSessionStatus;
  /** Why the last read failed, when `status` is "error". */
  error: unknown | null;
  login: (credentials: AdminLoginCredentials) => Promise<AdminLoginResult>;
  logout: () => Promise<void>;
  /** Re-reads the session, for a host that signs in without a full navigation. */
  refresh: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * Resolves the session once at the root so a host does not hand-roll the read, and every
 * consumer of it sees the same value.
 */
export function AdminAuthProvider({
  adapter,
  children,
}: {
  adapter: AdminAuthAdapter;
  children: ReactNode;
}) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [status, setStatus] = useState<AdminSessionStatus>("checking");
  const [error, setError] = useState<unknown | null>(null);
  const [boundAdapter, setBoundAdapter] = useState(adapter);
  // Bumped by anything that decides the session on its own, so an in-flight read that started
  // earlier cannot land on top of it.
  const decided = useRef(0);

  // Swapping the adapter invalidates whatever it resolved, which is a prop change, so it is
  // applied in render rather than in a post-paint effect write. The old session is dropped
  // with it: it belonged to the adapter that is going away, and leaving it readable while the
  // new read is in flight is exactly the stale-session case the guard exists to prevent. The
  // read that was in flight is already invalidated by the effect re-running.
  if (boundAdapter !== adapter) {
    setBoundAdapter(adapter);
    setSession(null);
    setStatus("checking");
  }

  const applySession = useCallback((next: AdminSession | null) => {
    setError(null);
    setSession(next);
    setStatus(next ? "authenticated" : "anonymous");
  }, []);

  // A read that throws is not an absent session. Reporting it as one would send a signed-in
  // visitor to the login page on every transient failure, and loop there if the login page
  // also depends on the session.
  const applyFailure = useCallback((cause: unknown) => {
    setError(cause);
    setSession(null);
    setStatus("error");
  }, []);

  const readSession = useCallback(() => adapter.getSession(), [adapter]);

  // A manual refresh records the failure like the initial read does, so the context is never
  // left describing a read that did not happen, and rethrows so a host that awaited it can
  // still show its own error. It obeys the same generation rule as the mount read, or a
  // refresh left in flight would re-apply its answer on top of a later sign-out.
  const refresh = useCallback(async () => {
    const mine = (decided.current += 1);
    try {
      const next = await readSession();
      if (mine === decided.current) applySession(next);
    } catch (cause) {
      if (mine === decided.current) applyFailure(cause);
      throw cause;
    }
  }, [applyFailure, applySession, readSession]);

  // The read is kicked off here but resolved in a callback, because a setState in the effect
  // body itself is a cascading render. The active flag drops a late answer to an unmounted
  // provider, which is what a slow session read during navigation produces. Both outcomes are
  // handled, because a read that only settles on success leaves the guard checking forever.
  useEffect(() => {
    let active = true;
    const mine = (decided.current += 1);
    void readSession().then(
      (next) => {
        if (active && mine === decided.current) applySession(next);
      },
      (cause: unknown) => {
        if (active && mine === decided.current) applyFailure(cause);
      },
    );
    return () => {
      active = false;
    };
  }, [applyFailure, applySession, readSession]);

  const login = useCallback(
    async (credentials: AdminLoginCredentials) => {
      decided.current += 1;
      const result = await adapter.login(credentials);
      // A failed sign-in must not leave a stale session behind, and a successful one has
      // to be reflected immediately rather than waiting for the next getSession.
      if (result.ok) {
        setError(null);
        setSession(result.session);
        setStatus("authenticated");
      } else {
        setError(null);
        setSession(null);
        setStatus("anonymous");
      }
      return result;
    },
    [adapter],
  );

  const logout = useCallback(async () => {
    decided.current += 1;
    await adapter.logout();
    setError(null);
    setSession(null);
    setStatus("anonymous");
  }, [adapter]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ session, status, error, login, logout, refresh }),
    [session, status, error, login, logout, refresh],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminSession(): AdminAuthContextValue {
  const value = useContext(AdminAuthContext);
  if (!value) {
    throw new Error("useAdminSession must be used inside AdminAuthProvider");
  }
  return value;
}

/**
 * A destination is usable only if every layer of encoding in it is still a plain same-site
 * path. Root-relative, not protocol-relative, and free of backslashes, which several
 * browsers normalise into a host separator.
 *
 * Control characters are refused as well. A URL parser strips them before resolving, so
 * "/%0D%0A/evil.example" passes every other check here and still resolves to another origin.
 */
// eslint-disable-next-line no-control-regex -- the point is to reject these, not to match them
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function isSameSitePath(value: string): boolean {
  if (CONTROL_CHARACTERS.test(value)) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  return !value.includes("\\");
}

/**
 * The destination a guard recorded, read back off a login page. Anything that is not a plain
 * same-site path is rejected: this value comes from a query string, so without the check a
 * crafted link would turn the sign-in page into an open redirect that hands a visitor to
 * another origin immediately after authenticating.
 *
 * Encoded layers are peeled as well, because a host that decodes before redirecting would
 * otherwise turn "/%2F%2Fevil.example" back into "//evil.example".
 */
export function adminReturnTo(search: URLSearchParams | null | undefined): string | null {
  const raw = search?.get("next");
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
  // Still changing after three rounds, so the value is obfuscated past the point of being
  // read safely. Refuse rather than guess which layer was meant.
  return null;
}

/** The same destination for a host that wants to read it in a component. */
export function useAdminReturnTo(): string | null {
  return adminReturnTo(useSearchParams());
}

/**
 * Attaches the preserved destination to a login URL, keeping any query the host already put
 * there. A second "?" would be malformed, and a host carrying a tenant or return flag in its
 * login URL is an ordinary case rather than an exotic one.
 */
function withNext(loginHref: string, next: string): string {
  // Split the fragment off first. Left in place, a login URL ending in "#section" would
  // swallow the query into the fragment and the destination would be lost.
  const hashAt = loginHref.indexOf("#");
  const fragment = hashAt === -1 ? "" : loginHref.slice(hashAt);
  const withoutFragment = hashAt === -1 ? loginHref : loginHref.slice(0, hashAt);

  const queryAt = withoutFragment.indexOf("?");
  const base = queryAt === -1 ? withoutFragment : withoutFragment.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : withoutFragment.slice(queryAt + 1));
  params.set("next", next);
  return `${base}?${params.toString()}${fragment}`;
}

function destination(pathname: string, search: string | null): string {
  if (!pathname) return "/";
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Guards a route tree. While the session is unknown, while it is known to be anonymous, and
 * while the read has failed, the children are not rendered at all: rendering them and hiding
 * them would leave focusable controls and readable text in the accessibility tree for content
 * the visitor is not allowed to have. Each state announces itself, and the anonymous state
 * keeps a real link so the redirect is never the only way forward.
 *
 * Reads the query string to preserve where the visitor was headed, so on a statically
 * generated page this needs a Suspense boundary, exactly like the other components that read
 * it. Pass `returnTo` to supply the destination directly and avoid the read.
 */
export function AdminRequireSession({
  children,
  loginHref = "/admin/login",
  returnTo,
  onRedirect,
  className,
}: {
  children: ReactNode;
  loginHref?: string;
  /** Overrides the destination read from the router. */
  returnTo?: string;
  /** Overrides navigation, for a host that redirects outside the app router. */
  onRedirect?: (href: string) => void;
  className?: string;
}) {
  const { status } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labels = useAdminMessages().shell;

  const search = searchParams?.toString() ?? null;
  const requested = returnTo ?? destination(pathname ?? "", search);
  const intended = isSameSitePath(requested) ? requested : "/";
  const loginUrl = withNext(loginHref, intended);

  useEffect(() => {
    if (status !== "anonymous") return;
    if (onRedirect) {
      onRedirect(loginUrl);
      return;
    }
    router.push(loginUrl);
  }, [status, loginUrl, onRedirect, router]);

  if (status === "authenticated") return <>{children}</>;

  if (status === "error") {
    return (
      <div role="alert" className={cn("p-6 text-sm text-zinc-600 dark:text-zinc-400", className)}>
        {labels.authSessionError}
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div role="status" className={cn("p-6 text-sm text-zinc-600 dark:text-zinc-400", className)}>
        {labels.authChecking}
      </div>
    );
  }

  return (
    <div role="status" className={cn("space-y-2 p-6 text-sm text-zinc-600 dark:text-zinc-400", className)}>
      <p>{labels.authRedirecting}</p>
      <p>
        <a href={loginUrl} className="font-medium text-admin-brand-text underline">
          {labels.authSignInLink}
        </a>
      </p>
    </div>
  );
}
