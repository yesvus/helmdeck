// SPDX-License-Identifier: MIT
/**
 * How Payload's admin panel learns who is signed in: by reading this host's session.
 *
 * This is the whole of "one session". A person signs in on this host's own form, the cookie that
 * comes out of it is the session every surface reads, and Payload's panel is a reader of that
 * session rather than a second sign-in form in front of a second account store.
 *
 * The strategy is the package's, so the refusal and the shape of the user are the package's: it
 * resolves the session, and a request with no session is anonymous rather than broken.
 */

import { createAdminPayloadAuthStrategy } from "@yesvus/helmdeck";
import type { AuthStrategy, AuthStrategyResult } from "payload";
import { readPayloadSession, USERS_COLLECTION } from "../session";

const strategy = createAdminPayloadAuthStrategy({ readSession: readPayloadSession });

export const payloadAuthStrategies: AuthStrategy[] = [
  {
    name: "helmdeck-session",
    /**
     * The panel's user, built from the session the host resolved.
     *
     * The package's strategy hands back the session's user as it is, and Payload wants a user
     * that names the collection it belongs to. Naming it here is the whole of the translation, and
     * it is here rather than in the session module so the session module says nothing about how
     * Payload sees it.
     */
    async authenticate(args): Promise<AuthStrategyResult> {
      const result = await strategy.authenticate(args);
      const session = result.user;
      if (!session) return { user: null };

      const user: NonNullable<AuthStrategyResult["user"]> = {
        id: session.id,
        email: session.email,
        collection: USERS_COLLECTION,
        role: session.role,
      };
      return { user };
    },
  },
];
