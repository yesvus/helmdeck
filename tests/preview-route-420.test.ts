// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { createExitPreviewRoute, createPreviewRoute } from "../examples/payload-host/lib/preview";

describe("draft preview route #420", () => {
  it("refuses anonymous requests before draft enablement or Payload config loading", async () => {
    const enableDraft = vi.fn();
    const loadPayloadConfig = vi.fn();
    const response = await createPreviewRoute({ readSession: async () => null, enableDraft, disableDraft: vi.fn(), loadPayloadConfig })(new Request("https://site.test/api/preview"));
    expect(response.status).toBe(401);
    expect(enableDraft).not.toHaveBeenCalled();
    expect(loadPayloadConfig).not.toHaveBeenCalled();
  });

  it("enables draft mode only for admins and loads config lazily after authorization", async () => {
    const order: string[] = [];
    const handler = createPreviewRoute({
      readSession: async () => ({ id: "operator", role: "admin" } as never),
      loadPayloadConfig: async () => { order.push("config"); },
      enableDraft: () => { order.push("enable"); },
      disableDraft: vi.fn(),
    });
    const response = await handler(new Request("https://site.test/api/preview"));
    expect(response.status).toBe(307);
    expect(order).toEqual(["config", "enable"]);
  });

  it("redirects admins to the requested same-origin page", async () => {
    const response = await createPreviewRoute({
      readSession: async () => ({ id: "operator", role: "admin" } as never),
      enableDraft: vi.fn(),
      disableDraft: vi.fn(),
    })(new Request("https://site.test/api/preview?url=%2Farticles%2Fhello%3Fdraft%3Dtrue"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://site.test/articles/hello?draft=true");
  });

  it("refuses off-site preview targets", async () => {
    const enableDraft = vi.fn();
    const response = await createPreviewRoute({
      readSession: async () => ({ id: "operator", role: "admin" } as never),
      enableDraft,
      disableDraft: vi.fn(),
    })(new Request("https://site.test/api/preview?url=https%3A%2F%2Fevil.test%2F"));
    expect(response.status).toBe(400);
    expect(enableDraft).not.toHaveBeenCalled();
  });

  it("disables draft mode on the exit route", async () => {
    const disableDraft = vi.fn();
    const response = await createExitPreviewRoute({ disableDraft })(new Request("https://site.test/api/exit-preview"));
    expect(response.status).toBe(307);
    expect(disableDraft).toHaveBeenCalledOnce();
  });
});
