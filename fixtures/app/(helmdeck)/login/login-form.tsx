// SPDX-License-Identifier: MIT

/**
 * The sign-in form, over the package's login screen and the demo's own action.
 *
 * The screen is a presentation surface: it collects credentials and reports what came back. Every
 * decision about them is made by the action it calls.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminLoginScreen, type AdminLoginCredentials } from "@yesvus/helmdeck";
import { useDemoLocale } from "../../../components/demo-i18n-provider";
// Type only, and erased at compile time. The accounts and the password arrive as props, because
// the module that hashes passwords is built on node:crypto and a browser must not be handed it.
import type { DemoAccount } from "../../../lib/demo-accounts";
import { signInAction } from "./actions";

export function LoginForm({
  search,
  accounts,
  password,
  ended,
}: {
  /** The page's own query string, so the action can validate the destination it was given. */
  search: string;
  accounts: readonly DemoAccount[];
  password: string;
  /** How many sessions an administrator just ended, carried here because the page re-rendered. */
  ended: number | null;
}) {
  const router = useRouter();
  const { copy } = useDemoLocale();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [message, setMessage] = useState<string | undefined>(
    ended === null ? undefined : `Ended ${ended} ${ended === 1 ? "session" : "sessions"}.`,
  );
  const [pending, setPending] = useState(false);

  async function signIn(credentials: AdminLoginCredentials) {
    setErrorMessage(undefined);
    setMessage(undefined);
    setPending(true);
    try {
      const result = await signInAction(credentials, search);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      router.push(result.next);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminLoginScreen
      brandLabel="Demo"
      homeHref="/"
      busy={pending}
      message={message}
      errorMessage={errorMessage}
      onSubmit={signIn}
    >
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">{copy.login.extraSlot}</p>
        {accounts.map((account) => (
          <div key={account.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm font-medium text-zinc-900">{account.email}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {account.role}: {account.note}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void signIn({ email: account.email, password })}
              className="mt-2 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
            >
              Sign in as the {account.role}
            </button>
          </div>
        ))}
        <p className="text-xs text-zinc-500">
          Both accounts use the password <span className="font-mono">{password}</span>.
        </p>
      </div>
    </AdminLoginScreen>
  );
}
