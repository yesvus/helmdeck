// SPDX-License-Identifier: MIT

/**
 * Where Payload believes it is served, which decides two things a person can see.
 *
 * `serverURL` names the origin in generated links and is the default entry in the CSRF allowlist for
 * cookie authentication. Left at a development default it becomes `localhost` in a deployment, and
 * the admin panel then refuses its own cookie-authenticated requests rather than serving them. It is
 * therefore read from the environment, with Vercel's own production domain as the second answer
 * because that is the variable a Vercel deployment is guaranteed to have.
 */

const DEFAULT_SERVER_URL = "http://localhost:3000";

/**
 * The environment, as this module reads it.
 *
 * `Record<string, string | undefined>` rather than `NodeJS.ProcessEnv`, because Next augments the
 * latter with a **required** `NODE_ENV` and a test passing `{ PAYLOAD_SERVER_URL: "..." }` would be a
 * type error over a variable this module never looks at.
 */
export function payloadServerURL(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.PAYLOAD_SERVER_URL?.trim();
  if (explicit) return explicit;

  const deployed = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (deployed) return `https://${deployed}`;

  return DEFAULT_SERVER_URL;
}