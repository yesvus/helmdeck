"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAction } from "@/lib/session-actions";
import { LOGIN_PATH } from "@/lib/sign-in";

/**
 * The way back into the shell, and the way out of it.
 *
 * The link is the other half of "one front door": a person who followed a link into Payload should
 * be able to get back to the dashboard without typing a URL, because an admin panel with no way
 * out reads as a different product that swallowed the one they were in.
 *
 * The sign-out is the host's own, because the session is the host's own. Payload's panel has a
 * logout button of its own, which ends Payload's session; the session that matters here is the
 * one the host signed, so this is the button that ends it.
 *
 * A Client Component, because it calls a Server Action and then moves the browser.
 */
export function PayloadBackLink() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await signOutAction();
      router.push(LOGIN_PATH);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="payload-back-link">
      <a className="payload-back-link__anchor" href="/admin">
        <span aria-hidden="true">←</span> Back to the workspace
      </a>
      <button
        type="button"
        className="payload-back-link__anchor"
        onClick={() => void signOut()}
        disabled={pending}
      >
        Sign out
      </button>
    </div>
  );
}

export default PayloadBackLink;
