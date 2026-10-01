// SPDX-License-Identifier: MIT

/**
 * How Payload's admin panel is made to read as helmdeck.
 *
 * Three overrides and a stylesheet. That is what "one look" actually consists of in practice, and
 * saying so is more useful than a claim of white labelling: Payload ships its own design system, its
 * own components and its own CSS custom properties, and a host restyles it by mapping its tokens and
 * replacing the handful of surfaces a person actually notices. What remains after this is Payload's
 * component styling, which is not reachable without replacing Payload's components wholesale.
 *
 *   - `graphics.Logo`     the mark on the login screen, which otherwise says a different product
 *   - `beforeDashboard`   what this panel is, on the page a person lands on
 *   - `afterNavLinks`     the way back into helmdeck's shell
 *
 * The stylesheet in `app/(payload)/custom.scss` does the rest by mapping Payload's `--theme-*`
 * variables onto helmdeck's own tokens, so the two surfaces change together when one of them is
 * retuned rather than being pinned to values copied at one moment.
 */

import type { Config } from "payload";

/** Component paths are relative to `admin.importMap.baseDir`, which is `app/(payload)`. */
const BASE = "../../components";

export const payloadTheme = {
  components: {
    graphics: {
      Logo: `${BASE}/payload-brand-logo`,
    },
    beforeDashboard: [`${BASE}/payload-dashboard-brief`],
    afterNavLinks: [`${BASE}/payload-back-link`],
  },
} satisfies { components: NonNullable<Config["admin"]>["components"] };