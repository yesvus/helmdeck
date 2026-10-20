// SPDX-License-Identifier: MIT

import { readMessage } from "../actions";
import { contactInboxMessage } from "../../../../../lib/contact-inbox-view";
import { MessageDetailClient } from "./message-detail-client";

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const message = contactInboxMessage(await readMessage(id));
  if (!message) return <p role="status">Message not found.</p>;
  return <MessageDetailClient message={message} />;
}
