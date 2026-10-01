// SPDX-License-Identifier: MIT
/**
 * A working reference implementation of the host adapters, so a new host can run the admin
 * without writing any of them. Every one is replaceable: these satisfy the same contracts a
 * hand-rolled adapter does, so adopting one is a default rather than a commitment.
 */
export { createAuditAdapter, createCacheAdapter, createMemoryPersistenceAdapter } from "./baseline/memory.js";
export type { MemoryRecord } from "./baseline/memory.js";
export { createCredentialAuthAdapter, createPersistenceCredentialStore } from "./baseline/credentials.js";
export {
  authenticate,
  CREDENTIAL_SESSIONS_SCHEMA,
  CREDENTIAL_USERS_SCHEMA,
} from "./baseline/credentials.js";
export type {
  AccountChanges,
  AccountRecord,
  CredentialAuthAdapter,
  CredentialAuthOptions,
  CredentialRevocation,
  CredentialSession,
  CredentialStore,
  CredentialStoreOptions,
  CredentialUser,
  NewAccount,
} from "./baseline/credentials.js";
export { AccountAlreadyExistsError } from "./baseline/credentials.js";
export { createAccountAdmin } from "./baseline/users.js";
export type {
  AccountAdmin,
  AccountAdminPolicy,
  AccountRefusal,
  AccountRefusalReason,
  AccountResult,
  AccountSession,
  CreateAccountInput,
} from "./baseline/users.js";
export { hashPassword, normalizeEmail, verifyPassword } from "./baseline/passwords.js";
export {
  createLoginThrottle,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLED_MESSAGE,
  DEFAULT_THROTTLE_WINDOW_MS,
  forwardedClientKey,
  loginHeader,
} from "./baseline/throttle.js";
export type {
  AdminLoginAttempt,
  AdminLoginHeaders,
  AdminLoginThrottle,
  LoginReservation,
  LoginThrottleDecision,
  LoginThrottleOptions,
} from "./baseline/throttle.js";
export { createSessionAuthAdapter, generateSessionSecret } from "./baseline/session.js";
export type { AdminSessionCookieIO } from "./baseline/session.js";
export { createSqlitePersistenceAdapter } from "./baseline/sqlite.js";
export type { SqlitePersistenceOptions } from "./baseline/sqlite.js";
export {
  createPostgresPersistenceAdapter,
  postgresIndexStatement,
  postgresSchema,
  postgresTenancyMigration,
} from "./baseline/postgres.js";
export type {
  PostgresClient,
  PostgresPersistenceOptions,
  PostgresResult,
  PostgresSchemaOptions,
} from "./baseline/postgres.js";
// The parts of tenancy that are safe to bundle for a browser: the key's rules, the resolver shape,
// and the refusal. The ambient scope is on `./tenant-scope` because it needs `node:async_hooks`.
export {
  AdminTenantError,
  assertAdminTenant,
  missingTenantReason,
  resolveAdminTenant,
} from "./baseline/tenant-core.js";
export type { AdminTenant, AdminTenantResolver } from "./baseline/tenant-core.js";
