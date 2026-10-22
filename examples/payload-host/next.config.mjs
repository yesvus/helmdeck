// SPDX-License-Identifier: MIT
/**
 * The host's Next configuration, wrapped in Payload's plugin.
 *
 * `withPayload` is what makes Payload's admin panel bundle inside a Next build: Payload compiles
 * its own Drizzle schema and pulls in ESM-only packages, and without the plugin its routes fail to
 * bundle for reasons that have nothing to do with the code that is wrong.
 */

import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPayload(nextConfig);
