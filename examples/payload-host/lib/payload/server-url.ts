// SPDX-License-Identifier: MIT
/**
 * Where Payload believes it is served, which decides two things a person can see.
 *
 * `serverURL` names the origin in generated links and is the default entry in the CSRF allowlist
 * for cookie authentication. Left at a development default it becomes `localhost` in a deployment,
 * and the admin panel then refuses its own cookie-authenticated requests rather than serving them.
 */

const DEFAULT_SERVER_URL = "http://localhost:3000";

export function payloadServerURL(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.PAYLOAD_SERVER_URL?.trim();
  if (explicit) return explicit;

  const deployed = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (deployed) return `https://${deployed}`;

  return DEFAULT_SERVER_URL;
}
