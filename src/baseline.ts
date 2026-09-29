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
  CredentialAuthAdapter,
  CredentialAuthOptions,
  CredentialSession,
  CredentialStore,
  CredentialStoreOptions,
  CredentialUser,
} from "./baseline/credentials.js";
export { hashPassword, normalizeEmail, verifyPassword } from "./baseline/passwords.js";
export { createSessionAuthAdapter, generateSessionSecret } from "./baseline/session.js";
export type { AdminSessionCookieIO } from "./baseline/session.js";
export { createSqlitePersistenceAdapter } from "./baseline/sqlite.js";
export type { SqlitePersistenceOptions } from "./baseline/sqlite.js";
