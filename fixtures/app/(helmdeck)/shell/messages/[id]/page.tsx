// SPDX-License-Identifier: MIT

import Link from "next/link.js";
import { Button } from "@yesvus/helmdeck";
import { readResourceAction } from "../../../../../lib/resource-actions";
import { markMessageHandled } from "../actions";

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await readResourceAction("contact_messages", id);
  if (record === null || typeof record !== "object") return <p role="status">Message not found.</p>;
  const message = record as ContactMessage;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <Link href="/shell/messages" className="text-sm font-medium text-brand-700 hover:underline">Back to messages</Link>
      <article className="rounded-xl border border-admin-border bg-admin-surface p-6">
        <header className="border-b border-admin-border pb-4">
          <h1 className="text-xl font-semibold text-admin-foreground">{message.subject}</h1>
          <p className="mt-2 text-sm text-admin-muted">
            From {message.name} ({message.email}) · {message.created_at}
          </p>
          <p className="mt-1 text-sm text-admin-muted">Status: {message.status}</p>
        </header>
        <p className="whitespace-pre-wrap py-6 text-sm text-admin-foreground">{message.message}</p>
        {message.status !== "handled" ? (
          <form action={markMessageHandled} className="border-t border-admin-border pt-4">
            <input type="hidden" name="id" value={message.id} />
            <Button type="submit">Mark handled</Button>
          </form>
        ) : null}
      </article>
    </main>
  );
}
