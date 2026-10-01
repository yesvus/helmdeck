// SPDX-License-Identifier: MIT

/**
 * The one dashboard the demo ships, named once.
 *
 * A page cannot export it: a route file's exports are the route's, and Next rejects anything else.
 * Both the page that renders the arrangement and the page that edits it resolve the same name, and
 * two literals spelling it differently would be a dashboard that reads one set of rows and edits
 * another.
 */
export const DEMO_DASHBOARD = "overview";
