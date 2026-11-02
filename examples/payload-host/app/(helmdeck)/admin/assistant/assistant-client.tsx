// SPDX-License-Identifier: MIT
"use client";
import { AdminAssistantPanel, type AdminAssistantAdapter, type AdminAssistantTool } from "@yesvus/helmdeck";

const adapter: AdminAssistantAdapter = { async *startTurn(messages) {
  const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
  if (!response.ok || !response.body) { yield { type: "error", error: { kind: response.status === 401 ? "denied" : "provider", message: "Assistant request failed." } }; return; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); const rows = buffer.split("\n"); buffer = rows.pop() ?? "";
    for (const row of rows) if (row.startsWith("data: ") && row !== "data: [DONE]") { const data = JSON.parse(row.slice(6)); if (data.text) yield { type: "text-delta", text: data.text }; if (data.error) yield { type: "error", error: data.error }; if (data.toolCall) { const call = data.toolCall; yield { type: "tool-call", id: String(call.id ?? crypto.randomUUID()), name: String(call.name ?? ""), args: call.args ?? {}, resolve: async (_context, allow) => { const result = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: call.name, args: call.args ?? {}, approved: allow }) }); const payload = await result.json(); if (!result.ok) throw new Error(payload.error ?? "Tool dispatch failed."); return payload.result; } }; } }
    if (done) break;
  }
  yield { type: "turn-end" };
} };
export function createAssistantTools(): AdminAssistantTool[] { return [
  { name: "searchBlogDrafts", title: "Search blog drafts", label: "Search drafts", description: "Search accessible blog drafts", parameters: { type: "object", properties: {} }, requiresApproval: false, execute: async () => undefined },
  { name: "draftBlogPostSummary", title: "Draft post summary", label: "Draft summary", description: "Prepare a summary for review", parameters: { type: "object", properties: { postId: { type: "string" } }, required: ["postId"] }, requiresApproval: true, execute: async () => undefined },
]; }
export function AssistantClient() { return <AdminAssistantPanel adapter={adapter} tools={createAssistantTools()} />; }
