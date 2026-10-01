// SPDX-License-Identifier: MIT

/**
 * Payload's `admin` settings, kept out of the config file so a test can read them.
 *
 * `buildConfig` returns a promise, so anything a test wants to assert about the finished config has to
 * await it, and awaiting it boots the whole thing. These are the claims worth checking, so they are
 * built here as plain values and the config file composes them: `admin.user` names the demo's own
 * accounts, the theme honours the visitor's stored preference, the components restyle the panel, and
 * one language is offered rather than Payload's thirty.
 */

import type { Config } from "payload";
import { payloadTheme } from "./payload-theme";

export const PAYLOAD_ADMIN_USER = "demo-accounts";

export const payloadAdmin = {
  // The collection Payload's admin panel accepts as a user. It is the demo's own `users` table, so an
  // account is one row rather than two, and the strategy in `payload-auth-strategy` resolves it from the
  // demo's session cookie rather than from a password Payload checks itself.
  user: PAYLOAD_ADMIN_USER,
  meta: {
    titleSuffix: "Content | Helmdeck",
    description: "Content editing by Payload, inside helmdeck's demo.",
  },
  // Both themes, because helmdeck's shell honours the visitor's stored preference and Payload's does too.
  // Restricting Payload to one would make the two disagree for anyone who chose the other.
  theme: "all",
  components: payloadTheme.components,
  // The demo's own sign-in is the only way in, so Payload's forgot-password route has nothing to offer.
  // The accounts collection's reset is disabled too, which is where the route's form would come from.
  routes: {
    login: "/login",
  },
} satisfies NonNullable<Config["admin"]>;