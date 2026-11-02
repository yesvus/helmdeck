import { createSessionAuthAdapter } from "@yesvus/helmdeck/baseline";
import { createAdminSessionGuard, createAdminPayloadAuthStrategy } from "@yesvus/helmdeck";
import type { AdminPayloadUser, AdminSession } from "@yesvus/helmdeck";
import { AuthenticationError, getPayload } from "payload";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, LOGIN_PATH } from "./sign-in";

function sessionSecret(): string {
  const secret = process.env.HELMDECK_SESSION_SECRET?.trim();
  if (!secret) throw new Error("HELMDECK_SESSION_SECRET is not set. Mint one with `node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"` and put it in .env.local.");
  return secret;
}

async function payloadInstance() {
  const { default: config } = await import("../payload.config");
  return getPayload({ config });
}

export const USERS_COLLECTION = "users";
export const auth = createSessionAuthAdapter({
  secret: sessionSecret(),
  cookieName: SESSION_COOKIE,
  secure: process.env.NODE_ENV === "production",
  async verify(credentials) {
    try {
      const result = await (await payloadInstance()).login({ collection: USERS_COLLECTION, data: credentials });
      return result.user?.id == null ? null : String(result.user.id);
    } catch (cause) {
      if (cause instanceof AuthenticationError) return null;
      throw cause;
    }
  },
  async getUser(id): Promise<AdminSession | null> {
    const user = await (await payloadInstance()).findByID({ collection: USERS_COLLECTION, id, depth: 0, disableErrors: true, overrideAccess: false, user: { id, collection: USERS_COLLECTION } });
    if (!user || typeof user.email !== "string") return null;
    return { userId: String(user.id), email: user.email, ...(typeof user.role === "string" ? { role: user.role } : {}) };
  },
});

export const currentAdminSession = () => auth.getSession();
export const requireAdminSession = createAdminSessionGuard({ session: currentAdminSession, loginHref: LOGIN_PATH, onUnauthenticated: ({ loginHref }) => redirect(loginHref) });
export async function readPayloadSession(): Promise<AdminPayloadUser | null> {
  const session = await currentAdminSession();
  return session?.userId ? { id: session.userId, email: session.email, collection: USERS_COLLECTION, ...(session.role ? { role: session.role } : {}) } : null;
}
export const payloadAuthStrategy = createAdminPayloadAuthStrategy({ readSession: readPayloadSession });
