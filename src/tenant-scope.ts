// SPDX-License-Identifier: MIT
/**
 * The tenant in context, for a server process.
 *
 * A separate entry point from `@yesvus/helmdeck/baseline` because these exports import
 * `node:async_hooks`, and the baseline subpath is reachable from a browser bundle: a Next.js app
 * imports `@yesvus/helmdeck/baseline` for its components, and pulling `async_hooks` in from there
 * fails the client build with "the chunking context does not support external modules".
 *
 * So the scope lives here, the rules live in the baseline subpath where they need no scope, and a
 * host imports this one only from server code: a route handler, a server action, a middleware, an
 * instrumented hook.
 */
export {
  createTenantScopedPersistenceAdapter,
  currentAdminTenant,
  hasAdminTenant,
  requireAdminTenant,
  runWithAdminTenant,
} from "./baseline/tenancy.js";
// Re-exported so a host that imports the scope does not also need the baseline subpath for the types
// its resolver has to satisfy.
export { AdminTenantError, assertAdminTenant, missingTenantReason, resolveAdminTenant } from "./baseline/tenant-core.js";
export type { AdminTenant, AdminTenantResolver } from "./baseline/tenant-core.js";