// SPDX-License-Identifier: MIT

/**
 * Where Payload's routes and its import map live, resolved from this module rather than from the
 * working directory.
 *
 * The two disagree. `process.cwd()` is the repository root in development and `/var/task` on Vercel,
 * while this file sits in `fixtures/lib`, so a path resolved from the working directory names a
 * directory that is not there. Resolving from `import.meta.url` gives the same absolute path in both,
 * which is what the Next build needed: it could not resolve `./app/(payload)` written as a URL against
 * the config, because the bundler reads that as a module and there is no module at a route group.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** This file's own directory, as an absolute path. */
const here = dirname(fileURLToPath(import.meta.url));

/** `fixtures/app/(payload)`, the route group holding Payload's admin panel, API and layout. */
export const PAYLOAD_ROUTE_GROUP = join(here, "..", "app", "(payload)");