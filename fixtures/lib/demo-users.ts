// SPDX-License-Identifier: MIT

/**
 * The demo's account row, and the password primitives it is written with.
 *
 * The hashing, the comparison and the lookup that answers an unknown address exactly as a wrong
 * password are the package's, because they are the part of a sign-in nobody should hand-roll per
 * host. This module is what the package has no vocabulary for: the two roles the seeded accounts
 * hold, which the rule in `demo-rules` is written against and which the package deliberately does
 * not know about.
 */

export { hashPassword, verifyPassword } from "@yesvus/helmdeck/baseline";

/** The roles the seed hands out. A role the rule does not define grants nothing, so this is the set. */
export type DemoRole = "admin" | "editor";

export type DemoUser = {
  id: string;
  email: string;
  /** `scrypt$<salt>$<key>`, as the package's `hashPassword` writes it. */
  passwordHash: string;
  role: DemoRole;
};
