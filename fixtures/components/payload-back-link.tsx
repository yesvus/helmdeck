// SPDX-License-Identifier: MIT

/**
 * The way back, from Payload's admin panel into helmdeck's shell.
 *
 * This is the other half of "one front door". A person who followed a link into Payload should be
 * able to get back to the dashboard without typing a URL, because an admin panel with no way out
 * reads as a different product that swallowed the one they were in.
 *
 * A Server Component taking no props, which is what Payload's `afterNavLinks` slot passes. The link
 * goes to the shell's own content page rather than to `/admin`, so it lands on the surface a person
 * actually left.
 */

const BACK_HREF = "/shell/content";

export function PayloadBackLink() {
  return (
    <div className="payload-back-link">
      <a className="payload-back-link__anchor" href={BACK_HREF}>
        <span aria-hidden="true">←</span> Back to the workspace
      </a>
    </div>
  );
}

export default PayloadBackLink;