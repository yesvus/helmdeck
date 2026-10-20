"use server";
import { createLoginThrottle, createSessionAuthAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminLoginCredentials, AdminLoginResult, AdminSession } from "@yesvus/helmdeck";
import { HOST_SESSION_COOKIE } from "./session-cookie";

const sampleSession: AdminSession = { email: "editor@example.test", name: "Sample editor", role: "editor" };
const loginThrottle = createLoginThrottle({ limit: 5, windowMs: 60_000 });
const activeSessions = new Set<string>();
const pendingSessions = new Set<string>();

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
    getUser: (id) => activeSessions.has(id) || pendingSessions.has(id) ? sampleSession : null,
    onSession: (id) => {
      if (id) {
        pendingSessions.delete(id);
        activeSessions.add(id);
      } else {
        pendingSessions.clear();
        activeSessions.clear();
      }
    },
    secure: process.env.NODE_ENV === "production",
    invalidMessage: "Email or password was incorrect.",
    throttle: loginThrottle,
  });
}

function createPendingSession(): string {
  const id = crypto.randomUUID();
  pendingSessions.add(id);
  return id;
}

export async function getHostSession(): Promise<AdminSession | null> {
  return hostAuth().getSession();
}

export async function loginHost(credentials: AdminLoginCredentials): Promise<AdminLoginResult> {
  return hostAuth().login(credentials);
}

export async function logoutHost(): Promise<void> {
  await hostAuth().logout();
}
