// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { AdminShellLabels } from "./labels";
import { mergeAdminLabels } from "./labels";

export type AdminLoginCredentials = {
  email: string;
  password: string;
};

export function AdminLoginScreen({
  logo,
  brandLabel,
  homeHref = "/",
  message,
  errorMessage,
  busy = false,
  onSubmit,
  children,
  labels,
}: {
  logo?: ReactNode;
  brandLabel?: string;
  homeHref?: string;
  message?: string;
  errorMessage?: string;
  busy?: boolean;
  onSubmit?: (credentials: AdminLoginCredentials) => void | Promise<void>;
  children?: ReactNode;
  labels?: Partial<AdminShellLabels>;
}) {
  const mergedLabels = mergeAdminLabels(labels);
  const [pending, setPending] = useState(false);
  const busyState = busy || pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!onSubmit) {
      return;
    }
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    try {
      await onSubmit({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
    } finally {
      setPending(false);
      form.reset();
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-6 py-16">
      <Link href={homeHref} className="mb-6">
        {logo ?? (
          <span className="text-lg font-bold uppercase tracking-[0.24em] text-zinc-500">
            {brandLabel ?? mergedLabels.brandLabel}
          </span>
        )}
      </Link>

      <div className="w-full max-w-[360px]">
        {message ? (
          <p className="mb-4 rounded-lg border-l-4 border-emerald-400 bg-white px-4 py-3 text-sm text-zinc-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mb-4 rounded-lg border-l-4 border-red-400 bg-white px-4 py-3 text-sm text-zinc-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {errorMessage}
          </p>
        ) : null}

        {children ? <div className="mb-4">{children}</div> : null}

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-zinc-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">{mergedLabels.loginEmail}</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                disabled={busyState}
                className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">
                {mergedLabels.loginPassword}
              </span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={busyState}
                className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <button
              type="submit"
              disabled={busyState}
              className="w-full rounded-md bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {mergedLabels.loginSubmit}
            </button>
          </div>
        </form>

        {homeHref ? (
          <p className="mt-4 text-center text-sm">
            <Link href={homeHref} className="text-zinc-600 hover:text-zinc-900">
              ← {mergedLabels.loginBack}
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
