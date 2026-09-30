import { createPersistenceCredentialStore, createSqlitePersistenceAdapter } from "@yesvus/helmdeck/baseline";
import type { AdminPersistenceAdapter } from "@yesvus/helmdeck";
import { databaseUrl } from "./database-url.mjs";

/**
 * The store, and the user and session rows the sign-in reads.
 *
 * SQLite, so the first run needs nothing installed, nothing configured and no schema designed: the
 * table is created on the first call. `HELMDECK_DATABASE_URL` and `HELMDECK_DATABASE_TOKEN` move it
 * to a hosted database, so growing into one is two environment variables rather than a rewrite.
 *
 * Reached only from `"use server"` modules and server components, so the client boundary is the
 * framework's own. Nothing here imports a browser API, and the database driver is loaded on the
 * first query rather than at import, so a client bundle that reached this module would still not
 * carry a connection.
 */
const authToken = process.env.HELMDECK_DATABASE_TOKEN;

export const persistence: AdminPersistenceAdapter = createSqlitePersistenceAdapter({
  url: databaseUrl,
  // Hosted connections only. A local file must not be given one, so the environment decides which
  // shape this is rather than a branch in feature code deciding it at run time.
  ...(authToken ? { authToken } : {}),
});

/**
 * Where the credential adapter keeps accounts and sessions: the same store, under two resource
 * names.
 *
 * Neither name is in `lib/resources.ts`, so neither is in the exposed set and a generated list can
 * never reach a password hash. That is the whole of how those two tables stay out of the admin's
 * table browser, and it is a property of what is absent rather than of a rule that has to be
 * remembered.
 */
export const credentialStore = createPersistenceCredentialStore(persistence);
