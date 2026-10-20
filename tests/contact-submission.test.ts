// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import { parseContactSubmission, persistContactSubmission } from "../fixtures/lib/contact-submission";

describe("parseContactSubmission", () => {
  it("trims and returns the supported contact fields", () => {
    expect(parseContactSubmission({
      name: " Ada ",
      email: " ada@example.com ",
      subject: " Question ",
      message: " Hello ",
      status: "handled",
    })).toEqual({ name: "Ada", email: "ada@example.com", subject: "Question", message: "Hello" });
  });

  it.each([
    null,
    [],
    { name: "", email: "ada@example.com", subject: "Q", message: "M" },
    { name: "Ada", email: "invalid", subject: "Q", message: "M" },
    { name: "A".repeat(121), email: "ada@example.com", subject: "Q", message: "M" },
    { name: "Ada", email: "ada@example.com", subject: "Q", message: "M".repeat(10_001) },
  ])("rejects invalid or oversized submission data", (input) => {
    expect(parseContactSubmission(input)).toBeNull();
  });

  it("persists only validated submissions through the host adapter", async () => {
    const persistence = createMemoryPersistenceAdapter();
    await persistContactSubmission(persistence, {
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
      status: "handled",
      id: "caller-controlled",
    }, "2026-10-20T00:00:00.000Z");

    expect(await persistence.query("contact_messages")).toEqual([
      {
        id: expect.any(String),
        name: "Ada",
        email: "ada@example.com",
        subject: "Question",
        message: "Hello",
        status: "new",
        created_at: "2026-10-20T00:00:00.000Z",
      },
    ]);
  });
});
