// SPDX-License-Identifier: MIT

/**
 * Boot-time half of the database guard.
 *
 * `ensureDemoSeeded` refuses a deployment that has no database, but only when a request reaches it. This
 * moves the refusal to the first request the server handles, so the deployment fails on its first visitor
 * rather than looking healthy until someone tries to save something.
 *
 * ## What it actually does, read from Next's source rather than assumed
 *
 * `registerInstrumentation` in `next/dist/server/lib/router-utils/instrumentation-globals.external.js`:
 *
 * - **Returns early when `NEXT_PHASE` is `phase-production-build`.** `register()` does not run during
 *   `next build` at all, so this cannot break a build that has no database. That matters, because this
 *   project's build runs with the database deliberately absent and must keep passing.
 * - **Re-throws** a failing `register()`, prefixing the message, and `ensureInstrumentationRegistered`
 *   memoizes the promise. A rejection is therefore cached: every subsequent call gets the same rejection,
 *   so each request fails with this message rather than the first one failing and the rest succeeding.
 *
 * So the honest description is **the server comes up and every request fails loudly**, not that the
 * process exits. An exit would be tidier, and the memoization is what rules it out: the rejection is
 * cached rather than retried. Claiming a crash here would be claiming something this does not do, and the
 * next person would look for a missing process when the real symptom is a 500 naming two variables.
 */

import { assertDemoPersistenceConfigured, demoPersistenceRequired } from "./lib/demo-persistence";

export function register() {
  if (!demoPersistenceRequired()) return;
  assertDemoPersistenceConfigured();
}