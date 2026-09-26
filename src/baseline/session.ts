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

const DEFAULT_COOKIE = "helmdeck_session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 14;

/**
 * A credential auth adapter over a signed cookie.
 *
 * The cookie carries a session id and an HMAC of it, so a client cannot invent a session or
 * tamper with one. Verifying the signature is this adapter's job; deciding *who* the
 * credentials belong to and looking that user up stay with the host, along with wherever the
 * session ids themselves are stored. `secret` must be the same value across every instance
 * that has to agree on a session, and a secret held in a repository is not a secret.
 */
export function createSessionAuthAdapter({
  verify,
  getUser,
  onSession,
  secret,
  cookieName = DEFAULT_COOKIE,
  maxAge = DEFAULT_MAX_AGE,
  path = "/",
  sameSite = "lax",
  secure = true,
  cookie,
  invalidMessage = "Those credentials were not accepted.",
}: {
  /** Resolves the session id for these credentials, or null to refuse them. */
  verify: (credentials: AdminLoginCredentials) => Promise<string | null> | string | null;
  /** Resolves the session for an id, or null when it is no longer valid. */
  getUser: (sessionId: string) => Promise<AdminSession | null> | AdminSession | null;
  /** Called with the new session id on sign-in and null on sign-out. */
  onSession?: (sessionId: string | null) => Promise<void> | void;
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
    return cookie ?? (await nextCookies(cookieName));
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
      } catch {
        // A session store that is briefly unreachable must read as signed out rather than
        // throwing through the provider, which would leave the guard unable to decide.
        return null;
      }
    },

    async login(credentials: AdminLoginCredentials): Promise<AdminLoginResult> {
      const sessionId = await verify(credentials);
      if (!sessionId) return { ok: false, message: invalidMessage };
      const session = await getUser(sessionId);
      if (!session) return { ok: false, message: invalidMessage };
      await (await store()).write(await seal(sessionId), options);
      await onSession?.(sessionId);
      return { ok: true, session };
    },

    async logout(): Promise<void> {
      await (await store()).clear({ path });
      await onSession?.(null);
    },
  };
}
