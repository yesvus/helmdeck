// SPDX-License-Identifier: MIT
"use client";

import Link from "next/link.js";
import { useRouter } from "next/navigation.js";
import { AdminInboxMessage, type AdminInboxMessageData, useAdminMessages } from "@yesvus/helmdeck";
import { defaultAdminInboxMessages } from "@yesvus/helmdeck";
import { archiveMessage, markMessageRead } from "../actions";

export function MessageDetailClient({ message }: { message: AdminInboxMessageData }) {
  const router = useRouter();
  const copy = { ...defaultAdminInboxMessages, ...useAdminMessages().inbox };

  async function markRead() {
    await markMessageRead(message.id);
    router.refresh();
  }

  async function archive() {
    await archiveMessage(message.id);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Link href="/shell/messages" className="text-sm font-medium text-brand-700 hover:underline">
        {copy.back}
      </Link>
      <AdminInboxMessage message={message} onMarkRead={markRead} onArchive={archive} />
    </main>
  );
}
