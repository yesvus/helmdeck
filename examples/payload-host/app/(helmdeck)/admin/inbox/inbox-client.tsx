// SPDX-License-Identifier: MIT

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminInboxList, type AdminInboxItem } from "@yesvus/helmdeck";
import { archiveFeedback } from "@/lib/payload/feedback-actions";

export function InboxClient({ messages, page, pageCount }: { messages: AdminInboxItem[]; page: number; pageCount: number }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [archiveError, setArchiveError] = useState(false);
  const onArchive = async (message: AdminInboxItem) => {
    setArchiveError(false);
    setIsPending(true);
    try {
      await archiveFeedback(message.id);
    } catch {
      setArchiveError(true);
    } finally {
      setIsPending(false);
    }
  };
  return <>{archiveError ? <p role="alert" className="mb-3 text-sm text-admin-danger-text">Could not archive this message.</p> : null}<AdminInboxList messages={messages} loading={isPending} page={page} pageCount={pageCount} onPageChange={(nextPage) => router.push(`/admin/inbox?page=${nextPage}`)} onOpen={(message) => router.push(`/admin/inbox/${encodeURIComponent(message.id)}`)} onArchive={onArchive} /></>;
}
