// SPDX-License-Identifier: MIT

export type AdminAssistantError = { kind: "provider" | "transient" | "denied"; message: string };
export type AdminAssistantMessage = { role: "user" | "assistant"; content: string };
export type AdminAssistantTool = {
  name: string;
  title: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
  execute(args: Record<string, unknown>): Promise<unknown> | unknown;
};
export type AdminAssistantEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; args: Record<string, unknown>; resolve(context: { tool: AdminAssistantTool; args: Record<string, unknown> }, allow: boolean): Promise<unknown> }
  | { type: "turn-end" }
  | { type: "error"; error: AdminAssistantError };
export type AdminAssistantAdapter = {
  startTurn(messages: AdminAssistantMessage[], tools: AdminAssistantTool[]): AsyncIterable<AdminAssistantEvent>;
};
