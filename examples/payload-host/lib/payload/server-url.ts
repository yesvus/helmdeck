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

  // The deployment's own origin, which is what a preview and a production deployment both need:
  // the CSRF allowlist and the links Payload writes are both about the origin the browser used.
  const deployment = env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment}`;

  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;

  return DEFAULT_SERVER_URL;
}
