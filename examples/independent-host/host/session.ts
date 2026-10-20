"use server";
import { createLoginThrottle, createSessionAuthAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminSession } from "@yesvus/helmdeck";

const sampleSession: AdminSession = { email: "editor@example.test", name: "Sample editor", role: "editor" };
const loginThrottle = createLoginThrottle({ limit: 5, windowMs: 60_000 });

function hostAuth() {
  const secret = process.env.INDEPENDENT_HOST_SESSION_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("INDEPENDENT_HOST_SESSION_SECRET is required in production.");
  }
  return createSessionAuthAdapter({
    secret: secret || "independent-host-local-development-secret",
    verify: ({ email, password }) => email === sampleSession.email && password === "helmdeck-demo" ? "editor" : null,
    getUser: (id) => id === "editor" ? sampleSession : null,
    secure: process.env.NODE_ENV === "production",
    invalidMessage: "Email or password was incorrect.",
    throttle: loginThrottle,
  });
}

export async function getHostSession(): Promise<AdminSession | null> {
  return hostAuth().getSession();
}

export async function loginHost(email: string, password: string): Promise<AdminSession | null> {
  const result = await hostAuth().login({ email, password });
  return result.ok ? result.session : null;
}

export async function logoutHost(): Promise<void> {
  await hostAuth().logout();
}
