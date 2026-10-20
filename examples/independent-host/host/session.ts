"use server";
import { createLoginThrottle, createSessionAuthAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminLoginCredentials, AdminLoginResult, AdminSession } from "@yesvus/helmdeck";
import { HOST_SESSION_COOKIE } from "./session-cookie";
import { activateSession, createPendingSession as storePendingSession, getSessionExpiry, revokeSession } from "./session-store";

const sampleSession: AdminSession = { email: "editor@example.test", name: "Sample editor", role: "editor" };
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const loginThrottle = createLoginThrottle({ limit: 5, windowMs: 60_000 });

function hostAuth() {
  const secret = process.env.INDEPENDENT_HOST_SESSION_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("INDEPENDENT_HOST_SESSION_SECRET is required in production.");
  }
  return createSessionAuthAdapter({
    secret: secret || "independent-host-local-development-secret",
    cookieName: HOST_SESSION_COOKIE,
    verify: ({ email, password }) => process.env.NODE_ENV !== "production"
      && email === sampleSession.email
      && password === "helmdeck-demo"
      ? createPendingSession()
      : null,
    getUser: (id) => {
      const expiresAt = getSessionExpiry(id);
      if (!expiresAt || expiresAt <= Date.now()) return null;
      return { ...sampleSession, id };
    },
    onSession: (id) => {
      if (id) activateSession(id);
    },
    maxAge: sessionMaxAgeSeconds,
    secure: process.env.NODE_ENV === "production",
    invalidMessage: "Email or password was incorrect.",
    throttle: loginThrottle,
  });
}

function createPendingSession(): string {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  storePendingSession(id, expiresAt);
  return id;
}

const auth = hostAuth();

export async function getHostSession(): Promise<AdminSession | null> {
  const session = await auth.getSession();
  if (!session) return null;
  return {
    email: session.email,
    ...(session.name ? { name: session.name } : {}),
    ...(session.role ? { role: session.role } : {}),
  };
}

export async function loginHost(credentials: AdminLoginCredentials): Promise<AdminLoginResult> {
  const result = await auth.login(credentials);
  if (!result.ok) return result;
  return {
    ok: true,
    session: {
      email: result.session.email,
      ...(result.session.name ? { name: result.session.name } : {}),
      ...(result.session.role ? { role: result.session.role } : {}),
    },
  };
}

export async function logoutHost(): Promise<void> {
  const session = await auth.getSession();
  if (session?.id) revokeSession(session.id);
  await auth.logout();
}
