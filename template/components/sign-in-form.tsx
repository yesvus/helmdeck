"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminLoginScreen, type AdminLoginCredentials } from "@yesvus/helmdeck";
import { signInAction } from "@/app/actions/session-actions";
import { APP_NAME } from "@/lib/brand";

/**
 * The sign-in form, over the package's login screen and this project's action.
 *
 * The screen is presentation: it collects credentials and reports what came back. Every decision
 * about them is made by the action, on the server, which is where the row and the cookie live.
 */
export function SignInForm({ search }: { search: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function signIn(credentials: AdminLoginCredentials) {
    setErrorMessage(undefined);
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
      brandLabel={APP_NAME}
      homeHref="/"
      busy={pending}
      errorMessage={errorMessage}
      onSubmit={signIn}
    />
  );
}
