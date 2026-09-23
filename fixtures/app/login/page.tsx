"use client";

import { useState } from "react";
import { AdminLoginScreen } from "../../../src";

export default function LoginPage() {
  const [message, setMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  return (
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
          setErrorMessage("Password must be at least 4 characters.");
          return;
        }
        setMessage(`Signed in as ${email} (fixture only, no auth runs here).`);
      }}
    >
      <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-center text-xs text-zinc-500">
        Extra slot: a host app can drop a one-click dev login here.
      </div>
    </AdminLoginScreen>
  );
}
