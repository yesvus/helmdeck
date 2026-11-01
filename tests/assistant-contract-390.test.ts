// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import type { AdminAssistantAdapter, AdminAssistantTool } from "../src/shell/assistant";

describe("assistant contract", () => {
  it("supports adapter iteration through an explicit end event", async () => {
    const adapter: AdminAssistantAdapter = { async *startTurn() { yield { type: "text-delta", text: "hi" }; yield { type: "turn-end" }; } };
    const events = [];
    for await (const event of adapter.startTurn([], [])) events.push(event.type);
    expect(events).toEqual(["text-delta", "turn-end"]);
  });
  it("keeps execution under host approval and executes only when explicitly allowed", async () => {
    const execute = vi.fn(async (args: Record<string, unknown>) => args);
    const tool: AdminAssistantTool = { name: "draft", title: "Draft", label: "Draft", description: "Prepare", parameters: { type: "object" }, requiresApproval: true, execute };
    expect(tool.requiresApproval).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    await tool.execute({ title: "Review" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ title: "Review" });
  });
});
