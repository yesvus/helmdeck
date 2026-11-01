// SPDX-License-Identifier: MIT

import { sanitizeAssistantData, type AdminAssistantRunRecord, type AdminPayloadUser } from "@yesvus/helmdeck";

const records: AdminAssistantRunRecord[] = [];

export function recordAssistantRun(record: AdminAssistantRunRecord): void {
  records.unshift(record);
  if (records.length > 100) records.length = 100;
}

export function listAssistantRuns(): AdminAssistantRunRecord[] {
  return records.map((record) => structuredClone(record));
}

export async function readAssistantHistory(readSession: () => Promise<AdminPayloadUser | null>): Promise<AdminAssistantRunRecord[] | null> {
  const session = await readSession();
  return session?.role === "admin" ? listAssistantRuns() : null;
}

export async function dispatchAssistantTool(input: {
  name: string;
  args: Record<string, unknown>;
  registered: Array<{ name: string; requiresApproval: boolean; execute(args: Record<string, unknown>): Promise<unknown> | unknown }>;
  allowedNames?: string[];
  approved?: boolean;
}): Promise<unknown> {
  const startedAt = new Date().toISOString();
  const tool = input.registered.find((candidate) => candidate.name === input.name);
  const permitted = tool && input.allowedNames?.includes(tool.name);
  const approval = !permitted ? "denied" : tool.requiresApproval ? input.approved ? "approved" : "denied" : "not-required";
  let result: unknown = null;
  let error: string | undefined;
  if (permitted && approval !== "denied") {
    try { result = await tool.execute(input.args); }
    catch (failure) { error = failure instanceof Error ? failure.message : "Tool failed."; }
  }
  const finishedAt = new Date().toISOString();
  recordAssistantRun({ id: crypto.randomUUID(), startedAt, finishedAt, outcome: error ? "failed" : approval === "denied" ? "denied" : "completed", toolCalls: [{
    tool: input.name,
    args: sanitizeAssistantData(input.args).content,
    result: result === null ? null : sanitizeAssistantData(result).content,
    ...(error ? { error } : {}),
    approval,
  }] });
  if (approval === "denied") throw new Error("Assistant tool was denied.");
  if (error) throw new Error(error);
  return result;
}
