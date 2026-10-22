// SPDX-License-Identifier: MIT
/**
 * Payload's own admin settings, kept out of the config file so they can be read on their own.
 */

import type { Config } from "payload";
import { LOGIN_PATH } from "../sign-in";
import { payloadTheme } from "./theme";

/** Where the panel is mounted. The shell owns `/admin`, so the panel is mounted beside it. */
export const PAYLOAD_ADMIN_ROUTE = "/payload";

export const payloadAdmin = {
  // The collection the panel accepts as a user, which is this host's own accounts.
  user: "users",
  meta: {
    titleSuffix: "Content | Payload host",
    description: "Content editing by Payload, inside this host's shell.",
  },
  // Both themes, so the panel is not the one surface where a person is stuck in a mode they did not
  // choose. The shell honours the visitor's stored preference and Payload's does too.
  theme: "all",
  components: payloadTheme.components,
  routes: {
    // This host's own sign-in page. Payload's panel has no form of its own, so there is one place
    // where a password is typed and one place where a session is refused.
    login: LOGIN_PATH,
  },
} satisfies NonNullable<Config["admin"]>;
