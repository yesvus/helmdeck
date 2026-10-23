// SPDX-License-Identifier: MIT
/**
 * Password hashing: scrypt from Node core, one random salt per hash, and a constant-time compare.
 *
 * scrypt rather than Argon2id: both are memory-hard, and this keeps the package free of a native
 * dependency, which is the thing a host installing an admin panel should not have to compile. The
 * cost parameters are Node's defaults rather than hand-picked ones, because a package should not
 * be the thing that decides a number its users cannot see, and because the scheme travels inside
 * the stored value so the parameters can be raised later without invalidating existing rows.
 *
 * **This module is server-side.** The key derivation comes from `node:crypto`, which no browser
 * bundle can resolve, and that is deliberate rather than incidental: a password check that has to
 * work in a browser has to ship the verifier to whoever is probing it.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

/** The prefix every stored hash carries, so a scheme from another library is refused rather than read. */
const SCHEME = "scrypt";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Hashes a password into the string a user row should hold.
 *
 * The result is `scrypt$<salt>$<key>`, both parts base64. The parameters travel with the hash so
 * a future default can be raised without a migration that invalidates every stored credential.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${SCHEME}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Checks a password against a stored hash, or refuses.
 *
 * A value that is not a hash this module wrote is refused rather than parsed, so a row that was
 * never hashed, or was hashed by something else, fails the sign-in instead of taking the login
 * page down.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, keyPart] = typeof stored === "string" ? stored.split("$") : [];
  if (scheme !== SCHEME || !saltPart || !keyPart) return false;

  const salt = Buffer.from(saltPart, "base64");
  const expected = Buffer.from(keyPart, "base64");
  // Both are checked because both decode to nothing from input that is not base64 at all. A
  // zero-length key makes scrypt throw, which would take the login page down rather than failing
  // the login. A zero-length salt happens not to throw on the Node version tested, but a degenerate
  // salt is rejected on its own terms rather than because a runtime happens to tolerate it.
  if (expected.length === 0 || salt.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length);
  // Lengths differ only if the stored hash is malformed, and timingSafeEqual throws on a mismatch.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * The form an address is stored and looked up in.
 *
 * Case is not significant in an address and surrounding space is a paste, so both are folded away
 * before anything is compared. A host writing a user row must store the address through this, or
 * the sign-in will not find the row the host thinks it wrote.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
