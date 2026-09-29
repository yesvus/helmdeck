// SPDX-License-Identifier: MIT

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing for the demo's seeded accounts.
 *
 * scrypt from Node core rather than Argon2id: both are memory-hard, and this keeps the demo free of a
 * native dependency, which a public demo should not be carrying. The parameters are Node's defaults
 * rather than hand-picked ones, because a demo's job is to demonstrate the shape of the right thing
 * and Node's defaults are the right thing at the time of writing.
 *
 * This lives in the fixture, not the package. The package's adapter types are a seam and do not imply
 * a backend, and a component library that hashed passwords would be making a decision that belongs to
 * the host.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export type DemoUser = {
  id: string;
  email: string;
  /** `scrypt$<salt base64>$<key base64>`, so the parameters travel with the hash. */
  passwordHash: string;
  role: "admin" | "editor";
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, keyPart] = stored.split("$");
  if (scheme !== "scrypt" || !saltPart || !keyPart) return false;

  const expected = Buffer.from(keyPart, "base64");
  // A base64 string that decodes to nothing yields a zero-length key, and scrypt rejects a length of
  // zero by throwing, which would take the login page down instead of failing the login.
  if (expected.length === 0) return false;

  const actual = await scrypt(password, Buffer.from(saltPart, "base64"), expected.length);
  // Lengths differ only if the stored hash is malformed, and timingSafeEqual throws on a mismatch.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Checks a password against the user with that email, or fails identically when there is no such user.
 *
 * A store that reports "no such user" differently, or faster, is a user enumeration oracle, and a
 * public login form is exactly where that gets harvested. The cost is a hash computed for an address
 * nobody has, which is the price of not answering the question.
 */
export async function authenticate(
  users: readonly DemoUser[],
  email: string,
  password: string,
): Promise<DemoUser | null> {
  const user = users.find((candidate) => candidate.email === email.toLowerCase().trim());
  if (!user) {
    // Parsed and hashed so the cost matches a real verification; see the note above.
    await verifyPassword(password, await hashPassword("no such user"));
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}
