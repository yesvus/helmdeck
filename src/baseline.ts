// SPDX-License-Identifier: MIT
/**
 * The parts of the baseline that survive the major version: the cookie session
 * adapter for a host that signs its own session, and the tenancy rules that
 * wrap any adapter.
 */
export { createSessionAuthAdapter, generateSessionSecret } from "./baseline/session.js";
export type { AdminSessionCookieIO } from "./baseline/session.js";
// The parts of tenancy that are safe to bundle for a browser: the key's rules, the resolver shape,
// and the refusal. The ambient scope is on `./tenant-scope` because it needs `node:async_hooks`.
export {
  AdminTenantError,
  assertAdminTenant,
  missingTenantReason,
  resolveAdminTenant,
} from "./baseline/tenant-core.js";
export type { AdminTenant, AdminTenantResolver } from "./baseline/tenant-core.js";
