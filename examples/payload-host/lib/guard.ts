// SPDX-License-Identifier: MIT
/**
 * The guard a page calls before it renders anything.
 *
 * This decides about a route rather than about a permission, and it runs where a redirect is a
 * response: a server component, a route handler or a server action. A page guarded only by a client
 * component has already been sent to whoever asked for it.
 */

import { redirect } from "next/navigation";
import { createAdminSessionGuard } from "@yesvus/helmdeck";
import { currentAdminSession } from "./session";
import { LOGIN_PATH } from "./sign-in";

export const requireAdminSession = createAdminSessionGuard({
  session: currentAdminSession,
  loginHref: LOGIN_PATH,
  onUnauthenticated: ({ loginHref }) => redirect(loginHref),
});
