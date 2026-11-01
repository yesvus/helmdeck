// SPDX-License-Identifier: MIT
import { readPayloadSession } from "../../../lib/session";
import type { AdminPayloadUser } from "@yesvus/helmdeck";
import { streamAssistant } from "../../../lib/assistant/openai-compatible";

export function createAssistantRoute(deps: { readSession: () => Promise<AdminPayloadUser | null>; fetchModel: typeof fetch }) {
 return async function POST(request: Request) {
  const session = await deps.readSession();
  if (!session || session.role !== "admin") return Response.json({ error: "denied" }, { status: 401 });
  let body: { messages?: Array<{ role: string; content: string }> };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
  const messages = body.messages;
  if (!Array.isArray(messages)) return Response.json({ error: "invalid request" }, { status: 400 });
  const stream = new ReadableStream<Uint8Array>({ async start(controller) {
    const encoder = new TextEncoder();
    try { for await (const text of streamAssistant(messages, request.signal, deps.fetchModel)) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)); controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
    catch { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { kind: "provider", message: "Assistant provider failed." } })}\n\n`)); }
    finally { controller.close(); }
  } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
 };
}

export const POST = createAssistantRoute({ readSession: readPayloadSession, fetchModel: fetch });
