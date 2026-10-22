// SPDX-License-Identifier: MIT
/**
 * Where Payload's routes and its import map live, resolved from this module rather than from the
 * working directory.
 *
 * The two disagree: `process.cwd()` is the directory the process was started in, while this file
 * sits in `lib/payload`, and a path resolved from the working directory names a directory that is
 * not there. Resolving from `import.meta.url` gives the same absolute path everywhere, which is
 * what the Next build needs.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** This file's own directory, as an absolute path. */
const here = dirname(fileURLToPath(import.meta.url));

/** `app/(payload)`, the route group holding Payload's admin panel and its API. */
export const PAYLOAD_ROUTE_GROUP = join(here, "..", "..", "app", "(payload)");
