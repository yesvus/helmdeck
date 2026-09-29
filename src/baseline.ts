// SPDX-License-Identifier: MIT
/**
 * A working reference implementation of the host adapters, so a new host can run the admin
 * without writing any of them. Every one is replaceable: these satisfy the same contracts a
 * hand-rolled adapter does, so adopting one is a default rather than a commitment.
 */
export { createAuditAdapter, createCacheAdapter, createMemoryPersistenceAdapter } from "./baseline/memory.js";
export type { MemoryRecord } from "./baseline/memory.js";
export { createSessionAuthAdapter } from "./baseline/session.js";
export type { AdminSessionCookieIO } from "./baseline/session.js";
export { createSqlitePersistenceAdapter } from "./baseline/sqlite.js";
export type { SqlitePersistenceOptions } from "./baseline/sqlite.js";
