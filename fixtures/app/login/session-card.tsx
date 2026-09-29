// SPDX-License-Identifier: MIT

/**
 * What a signed-in visitor sees: the session the server resolved, and the two ways out of it.
 *
 * The role shown here is the one in the session, which came from the account. The administrator
 * action is the visible difference between the two accounts, and the action refuses it again on
 * the server, so the disabled button is a courtesy rather than the control.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminSession } from "@yesvus/helmdeck";
import { endEverySessionAction, signOutAction } from "./actions";

export function SessionCard({ session, loginPath }: { session: AdminSession; loginPath: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const isAdmin = session.role === "admin";

  async function run(action: () => Promise<{ ok: boolean; message: string; ended?: number }>) {
    setErrorMessage(undefined);
    setMessage(undefined);
    setPending(true);
    try {
      const result = await action();
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      // Ending every session includes the one this browser holds, so the page comes back signed
      // out. The count goes in the URL because the state that carried the message is gone with it.
      if (result.ended === undefined) {
        router.refresh();
        return;
      }
      router.push(`${loginPath}?ended=${result.ended}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-6 py-16">
      <div className="w-full max-w-[360px]">
        {message ? (
          <p className="mb-4 rounded-lg border-l-4 border-emerald-400 bg-admin-surface px-4 py-3 text-sm text-zinc-700">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mb-4 rounded-lg border-l-4 border-red-400 bg-admin-surface px-4 py-3 text-sm text-zinc-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="rounded-lg border border-zinc-200 bg-admin-surface p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <h1 className="text-sm font-medium text-zinc-700">Signed in</h1>
          <p className="mt-2 text-sm text-zinc-900">{session.email}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {isAdmin ? "Administrator" : "Editor"}:{" "}
            {isAdmin ? "every session can be ended here" : "content and the dashboard only"}
          </p>

          <div className="mt-5 space-y-2">
            <Link
              href="/dashboard"
              className="block rounded-md bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-admin-on-brand transition-colors hover:bg-brand-600"
            >
              Open the dashboard
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => void run(signOutAction)}
              className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
            >
              Sign out
            </button>
            <button
              type="button"
              disabled={pending || !isAdmin}
              title={isAdmin ? undefined : "Only an administrator can end every session."}
              onClick={() => void run(endEverySessionAction)}
              className="w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60"
            >
              End every session
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-sm">
          <Link href="/" className="text-zinc-600 hover:text-zinc-900">
            Back to the demo
          </Link>
        </p>
      </div>
    </main>
  );
}
