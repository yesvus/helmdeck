/**
 * Where records live, as one fact in one place.
 *
 * Read by `lib/persistence.ts` and by `scripts/create-user.mjs` alike. A script that resolved its
 * own URL would create the first administrator in a database the app never opens, and the sign-in
 * would answer that nothing matches.
 */
export const databaseUrl = process.env.HELMDECK_DATABASE_URL ?? "file:./helmdeck.db";
