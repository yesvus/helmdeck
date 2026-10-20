// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createMemoryPersistenceAdapter } from "../src/baseline/memory";
import {
  createContactSubmissionThrottle,
  parseContactSubmission,
  persistContactSubmission,
  validateAndThrottleContactSubmission,
} from "../fixtures/lib/contact-submission";

describe("parseContactSubmission", () => {
  it("caps contact submissions per process window and resets after the window", () => {
    let current = 1000;
    const allow = createContactSubmissionThrottle({ limit: 2, windowMs: 500, now: () => current });
    allow();
    allow();
    expect(allow).toThrow(/Too many contact messages/);
    current += 500;
    expect(allow).not.toThrow();
  });

  it("validates before charging the contact submission quota", () => {
    const allow = createContactSubmissionThrottle({ limit: 1 });
    expect(() => validateAndThrottleContactSubmission({ name: "" }, allow)).toThrow(/invalid/);
    expect(validateAndThrottleContactSubmission({
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
    }, allow)).toEqual({
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
    });
    expect(() => validateAndThrottleContactSubmission({
      name: "Ada",
      email: "ada@example.com",
      subject: "Question",
      message: "Hello",
    }, allow)).toThrow(/Too many contact messages/);
  });

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
