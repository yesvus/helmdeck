// SPDX-License-Identifier: MIT

/**
 * Payload's configuration, mounted inside helmdeck's demo.
 *
 * The boundary this file states is the one the docs state: Payload's admin panel is its own application
 * shell with its own `html` tag, so it lives in a `(payload)` route group beside the demo's own routes
 * rather than inside helmdeck's shell. What is shared is a session and a look, not a document.
 *
 * The settings are composed from modules rather than written here, each for a reason stated where it
 * lives: the admin panel's own settings in `payload-admin`, the database in `payload-db`, the custom
 * components in `payload-theme`. What is left here is what is genuinely this file's business, which is
 * the editor, the server URL, the CSRF allowlist and the one language.
 */

import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { en } from "@payloadcms/translations/languages/en";
import { buildConfig } from "payload";
import { payloadAdmin } from "./lib/payload-admin";
import { payloadCollections } from "./lib/payload-collections";
import { payloadDatabase } from "./lib/payload-db";
import { payloadServerURL } from "./lib/payload-server-url";
import { PAYLOAD_ROUTE_GROUP } from "./lib/payload-routes";

/**
 * The secret that signs Payload's own tokens.
 *
 * Read from the environment, with the demo's fallback written here rather than committed. A secret in a
 * repository is not a secret, and the demo's accounts are public, so what this is for is a browser
 * being unable to mint a token naming an account it did not sign in as. A deployment that leaves this
 * unset gets a value that is public, which is stated rather than hidden.
 */
function payloadSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.PAYLOAD_SECRET?.trim() || "helmdeck-demo-payload-signs-its-own-cookies";
}

export default buildConfig({
  serverURL: payloadServerURL(),
  secret: payloadSecret(),
  db: payloadDatabase(),
  // Payload's own rich text editor. helmdeck has no field type for this and is not going to grow one:
  // the editor, the blocks, the drafts and the version diff are the reason content editing is Payload's
  // job rather than this package's.
  editor: lexicalEditor(),
  collections: payloadCollections,
  admin: {
    ...payloadAdmin,
    importMap: {
      // Both paths are built from this file's own directory rather than from `process.cwd()`, because the
      // two differ: a Vercel build runs with the working directory at the repository root while the config
      // lives in `fixtures`, so a path resolved from the working directory names a directory that does not
      // exist there.
      baseDir: `${PAYLOAD_ROUTE_GROUP}`,
      importMapFile: `${PAYLOAD_ROUTE_GROUP}/admin/importMap.js`,
    },
  },
  // The admin panel serves itself, and the demo's own pages are on the same origin, so the browser's cookie
  // for one is the cookie for the other. Named rather than left empty so the allowlist is a decision
  // recorded in the config rather than a default nobody read. A cookie-authenticated request with an
  // `Origin` outside this list is refused by Payload's own JWT strategy, so this is a real gate.
  csrf: [payloadServerURL()],
  i18n: {
    // English only, named explicitly rather than left to Payload's own detection. The demo's shell has one
    // language, so a panel that silently followed a browser into thirty others would be the one surface
    // where a person sees a different product. Payload's `en` is imported rather than written, so a missing
    // string is Payload's to fix rather than this config's.
    supportedLanguages: { en },
    fallbackLanguage: "en",
  },
});