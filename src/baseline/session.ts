// SPDX-License-Identifier: MIT
import type {
  AdminAuthAdapter,
  AdminLoginCredentials,
  AdminLoginResult,
  AdminSession,
} from "../adapters/index.js";

/** How the adapter reaches the session cookie. Defaults to Next's own cookie store. */
export type AdminSessionCookieIO = {
  read: () => Promise<string | undefined> | string | undefined;
  write: (value: string, options: { maxAge: number; path: string; sameSite: "lax" | "strict" | "none"; secure: boolean; httpOnly: boolean }) => Promise<void> | void;
  clear: (options: { path: string }) => Promise<void> | void;
};

export const DEFAULT_SESSION_COOKIE = "helmdeck_session";

/** Two weeks, so the row and the cookie it names lapse together rather than one outliving the other. */
export const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export const DEFAULT_INVALID_MESSAGE = "Those credentials were not accepted.";

/**
 * The shortest secret the adapter will sign with.
 *
 * The cookie is signed, not encrypted, so the only thing between an attacker and a session id
 * they chose is how much of the key space a guess has to cover. Sixteen characters is a floor
 * rather than a recommendation, so a host that reaches for `changeme` hears about it from the
 * constructor rather than from an incident report.
 */
const MIN_SECRET_LENGTH = 16;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Constant-time comparison, so a wrong signature cannot be discovered byte by byte. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function nextCookies(name: string): Promise<AdminSessionCookieIO> {
  const { cookies } = await import("next/headers.js");
  return {
    read: async () => (await cookies()).get(name)?.value,
    write: async (value, options) => {
      (await cookies()).set(name, value, options);
    },
    // The path the cookie was written with, so a cookie scoped below the root is cleared too.
    clear: async ({ path }) => {
      (await cookies()).delete({ name, path });
    },
  };
}

/**
 * Mints a secret for a session adapter, for the host that has to supply one.
 *
 * Thirty-two random bytes is the point past which a guess stops being worth attempting, and the
 * value belongs in the environment rather than in a repository, which is why a host runs this
 * once at install time instead of the package carrying a default to fall back on.
 */
export function generateSessionSecret(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Seals a session id into a cookie value and opens it again, or refuses.
 *
 * Split out from the adapter so a caller that must read the cookie itself, such as a sign-out
 * that also ends the row behind it, verifies the signature exactly as the adapter does rather
 * than splitting the value a second way.
 */
export function createSessionSigner(secret: string): {
  seal: (sessionId: string) => Promise<string>;
  unseal: (value: string | undefined) => Promise<string | null>;
} {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `A session cookie must be signed with a secret of at least ${MIN_SECRET_LENGTH} characters, and ` +
        "this one is missing or too short to be one. Generate a value with generateSessionSecret(), " +
        "keep it in the environment rather than in the repository, and use the same value on every " +
        "instance that has to agree on a session.",
    );
  }

  return {
    async seal(sessionId: string): Promise<string> {
      return `${sessionId}.${await hmac(secret, sessionId)}`;
    },

    async unseal(value: string | undefined): Promise<string | null> {
      if (!value) return null;
      const separator = value.lastIndexOf(".");
      if (separator <= 0) return null;
      const sessionId = value.slice(0, separator);
      const signature = value.slice(separator + 1);
      // A forged id never reaches the host's lookup, so the cookie cannot be used to ask which
      // session ids exist, and the comparison does not leak where the two first differ.
      return equal(await hmac(secret, sessionId), signature) ? sessionId : null;
    },
  };
}

/**
 * The cookie store for the current request, resolved the same way for every caller.
 *
 * Exported so the credential adapter reads and clears the request's own cookie rather than
 * opening a second connection to it, and so the browser check below is one place rather than a
 * rule each caller repeats.
 */
export async function resolveSessionCookie(
  cookieName: string,
  cookie?: AdminSessionCookieIO,
): Promise<AdminSessionCookieIO> {
  if (cookie) return cookie;
  if (typeof window !== "undefined") {
    throw new Error(
      "createSessionAuthAdapter reads an HTTP-only cookie and is server-side. Call it from a " +
        "server action or route handler and hand AdminAuthProvider a client-side adapter that " +
        "calls that, or pass the cookie option with your own store.",
    );
  }
  return nextCookies(cookieName);
}

/**
 * A credential auth adapter over a signed cookie.
 *
 * The cookie carries a session id and an HMAC of it, so a client cannot invent a session or
 * tamper with one. Verifying the signature is this adapter's job; deciding *who* the
 * credentials belong to and looking that user up stay with the host, along with wherever the
 * session ids themselves are stored. `secret` must be the same value across every instance
 * that has to agree on a session, and a secret held in a repository is not a secret.
 *
 * **This adapter is server-side.** The cookie is an HTTP-only value, and the default store
 * reads it through `next/headers`, which does not run in a browser. `AdminAuthProvider` is a
 * client component, so passing this adapter straight to it will not work; the intended wiring
 * is a server action or route handler that owns the cookie, with a thin client-side adapter
 * that calls it. Pass `cookie` to supply that indirection yourself.
 */
export function createSessionAuthAdapter({
  verify,
  getUser,
  onSession,
  onError,
  secret,
  cookieName = DEFAULT_SESSION_COOKIE,
  maxAge = DEFAULT_SESSION_MAX_AGE,
  path = "/",
  sameSite = "lax",
  secure = true,
  cookie,
  invalidMessage = DEFAULT_INVALID_MESSAGE,
}: {
  /** Resolves the session id for these credentials, or null to refuse them. */
  verify: (credentials: AdminLoginCredentials) => Promise<string | null> | string | null;
  /** Resolves the session for an id, or null when it is no longer valid. */
  getUser: (sessionId: string) => Promise<AdminSession | null> | AdminSession | null;
  /** Called with the new session id on sign-in and null on sign-out. */
  onSession?: (sessionId: string | null) => Promise<void> | void;
  /** Called when the session store fails, since a failure reads as signed out. */
  onError?: (cause: unknown) => void;
  secret: string;
  cookieName?: string;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  /** Replaces the cookie store, for tests and for hosts outside Next's request scope. */
  cookie?: AdminSessionCookieIO;
  invalidMessage?: string;
}): AdminAuthAdapter {
  if (!secret) {
    throw new Error("createSessionAuthAdapter needs a secret to sign the session cookie with");
  }

  async function store(): Promise<AdminSessionCookieIO> {
    if (cookie) return cookie;
    if (typeof window !== "undefined") {
      throw new Error(
        "createSessionAuthAdapter reads an HTTP-only cookie and is server-side. Call it from a " +
          "server action or route handler and hand AdminAuthProvider a client-side adapter that " +
          "calls that, or pass the cookie option with your own store.",
      );
    }
    return nextCookies(cookieName);
  }

  async function seal(sessionId: string): Promise<string> {
    return `${sessionId}.${await hmac(secret, sessionId)}`;
  }

  async function unseal(value: string | undefined): Promise<string | null> {
    if (!value) return null;
    const separator = value.lastIndexOf(".");
    if (separator <= 0) return null;
    const sessionId = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    // A forged id never reaches getUser, so the cookie cannot be used to probe which session
    // ids exist, and the comparison does not leak where it first differs.
    return equal(await hmac(secret, sessionId), signature) ? sessionId : null;
  }

  const options = { maxAge, path, sameSite, secure, httpOnly: true } as const;

  return {
    async getSession(): Promise<AdminSession | null> {
      const sessionId = await unseal(await (await store()).read());
      if (!sessionId) return null;
      try {
        return await getUser(sessionId);
      } catch (cause) {
        // A session store that is briefly unreachable must read as signed out rather than
        // throwing through the provider, which would leave the guard unable to decide. The
        // channel is there so an outage is not silently indistinguishable from a sign-out.
        onError?.(cause);
        return null;
      }
    },

    async login(credentials: AdminLoginCredentials): Promise<AdminLoginResult> {
      const sessionId = await verify(credentials);
      if (!sessionId) return { ok: false, message: invalidMessage };
      const session = await getUser(sessionId);
      if (!session) return { ok: false, message: invalidMessage };
      // The host's own bookkeeping first: if it fails, nothing has been written, so the two
      // cannot disagree about whether the visitor is signed in.
      await onSession?.(sessionId);
      await (await store()).write(await seal(sessionId), options);
      return { ok: true, session };
    },

    async logout(): Promise<void> {
      await onSession?.(null);
      await (await store()).clear({ path });
    },
  };
}
