// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { streamAssistant } from "../examples/payload-host/lib/assistant/openai-compatible";
import { createAssistantRoute } from "../examples/payload-host/app/api/assistant/route";
import { dispatchAssistantTool, listAssistantRuns, readAssistantHistory, recordAssistantRun } from "../examples/payload-host/lib/assistant/runs";

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
  it("rejects anonymous tool dispatches without appending history", async () => {
    const before = listAssistantRuns().length;
    const handler = createAssistantRoute({ readSession: async () => null, fetchModel: vi.fn() });
    const response = await handler(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ tool: "searchBlogDrafts", args: {}, approved: true }) }));
    expect(response.status).toBe(401);
    expect(listAssistantRuns()).toHaveLength(before);
  });
  it("records an unregistered tool denial through the dispatch route", async () => {
    const handler = createAssistantRoute({ readSession: async () => ({ id: "admin", role: "admin" } as never), fetchModel: vi.fn(), registeredTools: [{ name: "searchBlogDrafts", requiresApproval: false, execute: vi.fn() }] });
    const response = await handler(new Request("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ tool: "deletePost", args: {}, approved: false }) }));
    expect(response.status).toBe(403);
    expect(listAssistantRuns()[0]?.toolCalls[0]).toMatchObject({ tool: "deletePost", approval: "denied" });
  });
  it("records approved and denied tool-call approvals", () => {
    recordAssistantRun({ id: "run-approval", startedAt: "2026-01-01", finishedAt: "2026-01-01", outcome: "denied", toolCalls: [
      { tool: "draftBlogPostSummary", args: { postId: "1" }, result: { ok: true }, approval: "approved" },
      { tool: "deletePost", args: { postId: "1" }, result: null, approval: "denied" },
    ] });
    expect(listAssistantRuns()[0]?.toolCalls.map((call) => call.approval)).toEqual(["approved", "denied"]);
  });
  it("denies unauthorized assistant history reads", async () => {
    expect(await readAssistantHistory(async () => null)).toBeNull();
    expect(await readAssistantHistory(async () => ({ id: "reader", role: "editor" } as never))).toBeNull();
  });
  it("never dispatches an unregistered tool and records the denial", async () => {
    const execute = vi.fn();
    await expect(dispatchAssistantTool({ name: "deletePost", args: {}, registered: [{ name: "search", requiresApproval: false, execute }] })).rejects.toThrow("denied");
    expect(execute).not.toHaveBeenCalled();
    expect(listAssistantRuns()[0]?.outcome).toBe("denied");
    expect(listAssistantRuns()[0]?.toolCalls[0]?.approval).toBe("denied");
  });
  it("records an approved server execution with its captured result", async () => {
    const execute = vi.fn(async () => ({ count: 3 }));
    await expect(dispatchAssistantTool({ name: "draft", args: {}, registered: [{ name: "draft", requiresApproval: true, execute }], allowedNames: ["draft"], approved: true })).resolves.toEqual({ count: 3 });
    expect(listAssistantRuns()[0]?.toolCalls[0]).toMatchObject({ approval: "approved", result: expect.stringContaining('"count":3') });
  });
  it("records a denied approval without executing", async () => {
    const execute = vi.fn();
    await expect(dispatchAssistantTool({ name: "draft", args: {}, registered: [{ name: "draft", requiresApproval: true, execute }], allowedNames: ["draft"], approved: false })).rejects.toThrow("denied");
    expect(execute).not.toHaveBeenCalled();
    expect(listAssistantRuns()[0]?.toolCalls[0]?.approval).toBe("denied");
  });
});
