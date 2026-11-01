// SPDX-License-Identifier: MIT

import { redirect } from "next/navigation";
import { readPayloadSession } from "@/lib/session";
import { readAssistantHistory } from "@/lib/assistant/runs";

export default async function AssistantHistoryPage() {
  const records = await readAssistantHistory(readPayloadSession);
  if (!records) redirect("/login?returnTo=%2Fadmin%2Fassistant%2Fhistory");
  return <main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Assistant run history</h1>
    {records.length === 0 ? <p>No assistant runs yet.</p> : <ul className="space-y-3">{records.map((record) => <li key={record.id} className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between"><time>{record.startedAt}</time><span className="rounded-full border px-2 py-1 text-sm">{record.outcome}</span></div>
      <p>{record.toolCalls.length} tool calls</p>
      <ul>{record.toolCalls.map((call, index) => <li key={`${call.tool}-${index}`}>{call.tool}: {call.approval}</li>)}</ul>
    </li>)}</ul>}
  </main>;
}
