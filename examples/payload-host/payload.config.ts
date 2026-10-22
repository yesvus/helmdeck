// SPDX-License-Identifier: MIT
/**
 * Payload's configuration, mounted inside this host.
 *
 * The boundary this file states is the one the docs state: Payload's admin panel is its own
 * application shell with its own `html` tag, so it lives in a `(payload)` route group beside this
 * host's own routes rather than inside the shell. What is shared is a session, a rule and a look,
 * not a document.
 *
 * The settings are composed from modules rather than written here, each for a reason stated where
 * it lives: the admin panel's own settings in `lib/payload/admin`, the collections in
 * `lib/payload/collections`, the database in `lib/payload/db`, the custom components in
 * `lib/payload/theme`. What is left here is what is genuinely this file's business: the editor,
 * the server URL, the CSRF allowlist, the one language and the route the panel is mounted at.
 */

import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { en } from "@payloadcms/translations/languages/en";
import { buildConfig } from "payload";
import { PAYLOAD_ADMIN_ROUTE, payloadAdmin } from "./lib/payload/admin";
import { payloadCollections } from "./lib/payload/collections";
import { payloadDatabase } from "./lib/payload/db";
import { PAYLOAD_ROUTE_GROUP } from "./lib/payload/routes";
import { payloadServerURL } from "./lib/payload/server-url";

/**
 * The secret that signs Payload's own tokens.
 *
 * Read from the environment, with no fallback. A secret held in a repository is not a secret, and
 * this one is what stops a browser minting a token naming an account it did not sign in as.
 */
function payloadSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.PAYLOAD_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "PAYLOAD_SECRET is not set. Mint one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"`, " +
        "put it in .env.local, and use the same value on every instance that has to agree on a " +
        "session.",
    );
  }
  return secret;
}

export default buildConfig({
  serverURL: payloadServerURL(),
  secret: payloadSecret(),
  db: payloadDatabase(),
  // Payload's own rich text editor. This host has no field type for this and is not going to grow
  // one: the editor, the blocks, the drafts and the version diff are the reason content editing is
  // Payload's job rather than this host's.
  editor: lexicalEditor(),
  collections: payloadCollections,
  admin: {
    ...payloadAdmin,
    importMap: {
      // Both paths are built from this file's own directory rather than from `process.cwd()`,
      // because the two differ: a Vercel build runs with the working directory at the repository
      // root while the config lives in this directory, so a path resolved from the working
      // directory names a directory that does not exist there.
      baseDir: PAYLOAD_ROUTE_GROUP,
      importMapFile: `${PAYLOAD_ROUTE_GROUP}/payload/importMap.js`,
    },
  },
  routes: {
    // The shell owns `/admin`, so the panel is mounted beside it rather than under it.
    admin: PAYLOAD_ADMIN_ROUTE,
  },
  // The panel serves itself, and this host's own pages are on the same origin, so the browser's
  // cookie for one is the cookie for the other. Named rather than left empty so the allowlist is a
  // decision recorded in the config rather than a default nobody read.
  csrf: [payloadServerURL()],
  i18n: {
    // English only, named explicitly rather than left to Payload's own detection. The shell has one
    // language, so a panel that silently followed a browser into thirty others would be the one
    // surface where a person sees a different product.
    supportedLanguages: { en },
    fallbackLanguage: "en",
  },
});
