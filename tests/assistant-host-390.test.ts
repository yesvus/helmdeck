// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { streamAssistant } from "../examples/payload-host/lib/assistant/openai-compatible";
import { createAssistantRoute } from "../examples/payload-host/app/api/assistant/route";

describe("assistant host stream", () => {
  it("parses OpenAI-compatible SSE text deltas", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://provider.test/v1"); vi.stubEnv("OPENAI_API_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } })));
    const result = [];
    for await (const text of streamAssistant([])) result.push(text);
    expect(result).toEqual(["hello"]);
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
  it("denies anonymous sessions before any provider fetch", async () => {
    const fetcher = vi.fn();
    const handler = createAssistantRoute({ readSession: async () => null, fetchModel: fetcher });
    const response = await handler(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ messages: [] }) }));
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
