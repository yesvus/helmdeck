// SPDX-License-Identifier: MIT
/**
 * How Payload's admin panel is made to read as this host's.
 *
 * The mapping comes from the package, so the host exercises the shipped implementation rather than
 * a copy of it that could drift. The components themselves are the host's own, because the mark,
 * the line that says what this panel is and the way back are the host's own words.
 */

import { createAdminPayloadTheme } from "@yesvus/helmdeck";
import type { Config } from "payload";

/** Component paths are relative to `admin.importMap.baseDir`, which is `app/(payload)`. */
const BASE = "../../components";

export const payloadTheme = createAdminPayloadTheme({
  logo: `${BASE}/payload-brand-logo`,
  beforeDashboard: [`${BASE}/payload-dashboard-brief`],
  afterNavLinks: [`${BASE}/payload-back-link`],
}) satisfies { components: NonNullable<Config["admin"]>["components"] };
