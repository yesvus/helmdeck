// SPDX-License-Identifier: MIT
import { readPayloadSession } from "../../../lib/session";
import type { AdminPayloadUser } from "@yesvus/helmdeck";
import { streamAssistant } from "../../../lib/assistant/openai-compatible";
import { dispatchAssistantTool } from "../../../lib/assistant/runs";

type AssistantRouteDeps = { readSession: () => Promise<AdminPayloadUser | null>; fetchModel: typeof fetch; registeredTools?: Array<{ name: string; requiresApproval: boolean; execute(args: Record<string, unknown>): Promise<unknown> | unknown }> };

export function createAssistantRoute(deps: AssistantRouteDeps) {
 return async function POST(request: Request) {
   const session = await deps.readSession();
   if (!session || session.role !== "admin") return Response.json({ error: "denied" }, { status: 401 });
   let body: { messages?: Array<{ role: string; content: string }> };
   try { body = await request.json(); } catch { return Response.json({ error: "invalid request" }, { status: 400 }); }
   if (body && typeof body === "object" && "tool" in body) {
    const decision = body as { tool: string; args?: Record<string, unknown>; approved?: boolean };
    if (typeof decision.tool !== "string" || !decision.args || typeof decision.args !== "object" || Array.isArray(decision.args)) return Response.json({ error: "invalid request" }, { status: 400 });
    try {
     const registeredTools = deps.registeredTools ?? await (async () => {
      const { draftBlogPostSummary, searchBlogDrafts } = await import("../../../lib/assistant/blog-tools");
      return [
       { name: "searchBlogDrafts", requiresApproval: false, execute: searchBlogDrafts },
       { name: "draftBlogPostSummary", requiresApproval: true, execute: (args: Record<string, unknown>) => draftBlogPostSummary(String(args.postId ?? "")) },
      ];
     })();
     return Response.json({ result: await dispatchAssistantTool({ name: decision.tool, args: decision.args, registered: registeredTools, allowedNames: registeredTools.map((tool) => tool.name), approved: decision.approved === true }) });
    }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Tool failed." }, { status: 403 }); }
   }
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

export const POST = async (request: Request) => createAssistantRoute({ readSession: readPayloadSession, fetchModel: fetch })(request);
