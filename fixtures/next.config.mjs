// SPDX-License-Identifier: MIT

/**
 * The demo's Next configuration, wrapped in Payload's plugin.
 *
 * `withPayload` exists because Payload compiles Drizzle schema and handles ESM-only packages inside
 * the Next build, and without it the admin panel's routes fail to bundle for reasons that have nothing
 * to do with the code that is wrong. It is ESM, so this file is `.mjs`, which is also why the root
 * `package.json` declares `"type": "module"`.
 */

import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The demo is the repository root's `fixtures` directory, so Next needs to be told where the
  // workspace's own files are. Without this, a route that reaches outside `fixtures` cannot resolve.
  outputFileTracingRoot: new URL('../', import.meta.url).pathname,
  eslint: {
    // The demo is linted by the repository's own `pnpm lint`, which reads `eslint.config.mjs` at the
    // root. Duplicating that here would run the same rules twice and report the same file twice.
    ignoreDuringBuilds: true,
  },
}

export default withPayload(nextConfig)