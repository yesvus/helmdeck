"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation.js";
import { useAdminReturnTo, useAdminSession } from "@yesvus/helmdeck";

export function HostLoginForm() {
  const { login } = useAdminSession();
  const returnTo = useAdminReturnTo();
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const result = await login({
        email: String(values.get("email") ?? ""),
        password: String(values.get("password") ?? ""),
      });
      if (result.ok) router.replace(returnTo ?? "/admin");
      else setMessage(result.message);
    } catch {
      setMessage("Sign in could not be completed. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-sm gap-4 p-8">
      <label className="grid gap-1">
        Email
        <input
          className="rounded border p-2"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={process.env.NODE_ENV !== "production" ? "editor@example.test" : undefined}
        />
      </label>
      <label className="grid gap-1">
        Password
        <input className="rounded border p-2" name="password" type="password" autoComplete="current-password" required />
      </label>
      <button className="rounded bg-zinc-900 px-4 py-2 text-white" type="submit">Sign in</button>
      <p role="status">{message}</p>
      {process.env.NODE_ENV !== "production" && <p className="text-sm text-zinc-600">Demo password: helmdeck-demo</p>}
    </form>
  );
}
