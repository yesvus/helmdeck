"use client";

import { useState } from "react";
import { AdminLoginScreen } from "@yesvus/helmdeck";
import { DemoPageBar, useDemoLocale } from "../../components/demo-i18n-provider";

export default function LoginPage() {
  const { copy } = useDemoLocale();
  const [message, setMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  return (
    <>
      <DemoPageBar />
      <AdminLoginScreen
      brandLabel="Demo"
      homeHref="/"
      message={message}
      errorMessage={errorMessage}
      onSubmit={async ({ email, password }) => {
        setMessage(undefined);
        setErrorMessage(undefined);
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (password.length < 4) {
          setErrorMessage(copy.login.passwordError);
          return;
        }
        setMessage(copy.login.signedIn(email));
      }}
    >
      <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center text-xs text-zinc-500">
        {copy.login.extraSlot}
      </div>
      </AdminLoginScreen>
    </>
  );
}
