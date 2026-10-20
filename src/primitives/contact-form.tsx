// SPDX-License-Identifier: MIT
"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "./button.js";
import { AdminField } from "./field.js";
import { AdminInput, AdminTextarea } from "./input.js";

export type AdminContactSubmission = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type AdminContactFormLabels = {
  name: string;
  email: string;
  subject: string;
  message: string;
  submit: string;
  submitting: string;
  success: string;
  failure: string;
};

const DEFAULT_LABELS: AdminContactFormLabels = {
  name: "Name",
  email: "Email",
  subject: "Subject",
  message: "Message",
  submit: "Send message",
  submitting: "Sending…",
  success: "Your message was sent.",
  failure: "Your message could not be sent. Please try again.",
};

export function AdminContactForm({
  onSubmit,
  labels,
}: {
  onSubmit: (submission: AdminContactSubmission) => Promise<void>;
  labels?: Partial<AdminContactFormLabels>;
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<"success" | "failure" | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const submission = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      subject: String(data.get("subject") ?? ""),
      message: String(data.get("message") ?? ""),
    };
    setResult(null);
    startTransition(async () => {
      try {
        await onSubmit(submission);
        form.reset();
        setResult("success");
      } catch {
        setResult("failure");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5" aria-busy={busy}>
      <AdminField id="contact-name" label={copy.name}>
        <AdminInput id="contact-name" name="name" autoComplete="name" maxLength={120} required />
      </AdminField>
      <AdminField id="contact-email" label={copy.email}>
        <AdminInput id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required />
      </AdminField>
      <AdminField id="contact-subject" label={copy.subject}>
        <AdminInput id="contact-subject" name="subject" maxLength={160} required />
      </AdminField>
      <AdminField id="contact-message" label={copy.message}>
        <AdminTextarea id="contact-message" name="message" rows={6} maxLength={10000} required />
      </AdminField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? copy.submitting : copy.submit}
        </Button>
        {result ? (
          <p role={result === "failure" ? "alert" : "status"} className="text-sm text-admin-muted">
            {result === "success" ? copy.success : copy.failure}
          </p>
        ) : null}
      </div>
    </form>
  );
}
