// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { contactInboxMessage } from "../fixtures/lib/contact-inbox-view";

describe("contactInboxMessage", () => {
  it("maps host records into the inbox view model without owning their schema", () => {
    expect(contactInboxMessage({
      id: "msg-1",
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
      status: "new",
      created_at: "2026-10-20T00:00:00.000Z",
    })).toEqual({
      id: "msg-1",
      sender: "Ada (ada@example.com)",
      subject: "Question",
      preview: "Hello",
      body: "Hello",
      receivedAt: "2026-10-20T00:00:00.000Z",
      status: "unread",
    });
    expect(contactInboxMessage({
      id: "msg-2",
      name: "Grace",
      email: "grace@example.com",
      subject: "Update",
      message: "Thanks",
      status: "archived",
      created_at: "2026-10-20T00:00:00.000Z",
    })?.status).toBe("archived");
    expect(contactInboxMessage({ id: "incomplete" })).toBeNull();
  });
});
