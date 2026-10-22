// SPDX-License-Identifier: MIT

/**
 * How Payload's admin panel is made to read as Helmdeck's.
 *
 * Three overrides and a stylesheet. That is what "one look" actually consists of in practice, and
 * saying so is more useful than a claim of white labelling: Payload ships its own design system, its
 * own components and its own CSS custom properties, and a host restyles it by mapping its tokens and
 * replacing the handful of surfaces a person actually notices. What remains after this is Payload's
 * component styling, which is not reachable without replacing Payload's components wholesale.
 *
 *   - `graphics.Logo`     the mark on the login screen, which otherwise says a different product
 *   - `beforeDashboard`   what this panel is, on the page a person lands on
 *   - `afterNavLinks`     the way back into Helmdeck's shell
 *
 * The stylesheet that goes with it is `@yesvus/helmdeck/payload.css`, and it maps Payload's
 * `--theme-*` variables onto Helmdeck's own tokens, so the two surfaces change together when one of
 * them is retuned rather than being pinned to values copied at one moment.
 */

export type AdminPayloadThemeComponents = {
  /** The mark on the login screen, as a path relative to Payload's import map base directory. */
  logo?: string;
  /** What this panel is, on the page a person lands on. */
  beforeDashboard?: string[];
  /** The way back into Helmdeck's shell. */
  afterNavLinks?: string[];
};

/**
 * The components Payload's admin panel is given, so that it reads as the same product as the shell.
 *
 * The paths are the host's own components, because they are the host's own words: the mark, the
 * line that says what this panel is and the way back out of it.
 */
export function createAdminPayloadTheme({
  logo,
  beforeDashboard = [],
  afterNavLinks = [],
}: AdminPayloadThemeComponents = {}) {
  const components: {
    graphics?: { Logo?: string };
    beforeDashboard?: string[];
    afterNavLinks?: string[];
  } = {};

  if (logo) components.graphics = { Logo: logo };
  if (beforeDashboard.length > 0) components.beforeDashboard = beforeDashboard;
  if (afterNavLinks.length > 0) components.afterNavLinks = afterNavLinks;

  return { components };
}
