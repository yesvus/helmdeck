// SPDX-License-Identifier: MIT

import type { AdminInboxItem } from "@yesvus/helmdeck";
import { contactInboxMessage } from "../../examples/payload-host/lib/inbox-message";

export { contactInboxMessage } from "../../examples/payload-host/lib/inbox-message";

export const CONTACT_INBOX_PAGE_SIZE = 10;

export function contactInboxItem(value: unknown): AdminInboxItem | null {
  const message = contactInboxMessage(value);
  if (!message) return null;
  return {
    id: message.id,
    sender: message.sender,
    subject: message.subject,
    preview: message.preview,
    receivedAt: message.receivedAt,
    status: message.status,
  };
}
