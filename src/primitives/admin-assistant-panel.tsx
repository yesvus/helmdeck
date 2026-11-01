// SPDX-License-Identifier: MIT
"use client";

import { useState } from "react";
import type { AdminAssistantAdapter, AdminAssistantMessage, AdminAssistantTool } from "../shell/assistant.js";
import { Button } from "./button.js";
import { useAdminMessages } from "../i18n.js";

export type AdminAssistantPanelProps = { adapter: AdminAssistantAdapter; tools: AdminAssistantTool[]; title?: string };

export function AdminAssistantPanel({ adapter, tools, title }: AdminAssistantPanelProps) {
  const labels = useAdminMessages().assistant;
  const [messages, setMessages] = useState<AdminAssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ tool: AdminAssistantTool; args: Record<string, unknown>; resolve: (context: { tool: AdminAssistantTool; args: Record<string, unknown> }, allow: boolean) => Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function send() {
    if (!input.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput(""); setBusy(true); setStatus("");
    try {
      for await (const event of adapter.startTurn(next, tools)) {
        if (event.type === "text-delta") setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + event.text } : message));
        if (event.type === "tool-call") {
          const tool = tools.find((candidate) => candidate.name === event.name);
          if (!tool) { setStatus(labels.unknownTool); continue; }
          if (tool.requiresApproval) setPending({ tool, args: event.args, resolve: event.resolve });
          else await event.resolve({ tool, args: event.args }, true);
        }
        if (event.type === "error") setStatus(event.error.message);
      }
    } catch { setStatus(labels.requestFailed); }
    finally { setBusy(false); }
  }

  async function decide(allow: boolean) {
    const request = pending;
    if (!request) return;
    setPending(null);
    if (!allow) { await request.resolve({ tool: request.tool, args: request.args }, false); setStatus(labels.denied); return; }
    try { await request.resolve({ tool: request.tool, args: request.args }, true); setStatus(labels.approved); }
    catch { setStatus(labels.toolFailed); }
  }

  return <section className="rounded-xl border border-border bg-card p-4 text-card-foreground" aria-label={title ?? labels.title}>
    <h2 className="text-lg font-semibold">{title ?? labels.title}</h2>
    <div aria-live="polite" className="my-4 max-h-96 space-y-3 overflow-auto">{messages.map((message, index) => <p key={index} className="whitespace-pre-wrap">{message.role}: {message.content}</p>)}</div>
    {pending && <div className="rounded-lg border border-amber-500/50 p-3" role="alert"><p>{pending.tool.title}: {JSON.stringify(pending.args)}</p><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => void decide(true)}>{labels.approve}</Button><Button variant="outline" disabled={busy} onClick={() => void decide(false)}>{labels.deny}</Button></div></div>}
    <p role="status" aria-live="polite">{busy ? labels.working : status}</p>
    <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}><input className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2" value={input} onChange={(event) => setInput(event.target.value)} aria-label={labels.message} disabled={busy} /><Button type="submit" disabled={busy || !input.trim()}>{busy ? labels.working : labels.send}</Button></form>
  </section>;
}
