// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceList } from "@yesvus/helmdeck";
import { messagesResource } from "../../../../lib/admin-resources";
import { pagedClientPersistence } from "../../../../lib/client-persistence";

export default function MessagesPage() {
  return (
    <AdminResourceList
      definition={messagesResource}
      persistence={pagedClientPersistence}
      detailBaseHref="/shell/messages"
    />
  );
}
