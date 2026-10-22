// SPDX-License-Identifier: MIT
/**
 * Payload's login-page mark, replaced with this host's wordmark.
 *
 * The one place "one look" is cheapest, because the login screen is the first thing a person sees on
 * arriving and Payload's own logo says a different product outright. It is a Server Component with
 * no props, which is what Payload's `graphics.Logo` slot accepts.
 */

import { APP_NAME } from "@/lib/brand";

export function PayloadBrandLogo() {
  return (
    <span className="payload-brand-logo">
      <span className="payload-brand-logo__mark" aria-hidden="true" />
      <span className="payload-brand-logo__text">{APP_NAME}</span>
      <span className="payload-brand-logo__suffix">Content</span>
    </span>
  );
}

export default PayloadBrandLogo;
