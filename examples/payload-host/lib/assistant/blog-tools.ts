// SPDX-License-Identifier: MIT

"use server";

import { payloadInstance } from "../payload/content";
import { readPayloadSession } from "../session";

export type AssistantToolResult = { ok: true; data: unknown } | { ok: false; error: { kind: "denied" | "transient"; message: string } };

async function run<T>(work: () => Promise<T>): Promise<AssistantToolResult> {
  try { return { ok: true, data: await work() }; }
  catch (error) { return { ok: false, error: { kind: error instanceof Error && error.message.includes("authorized") ? "denied" : "transient", message: error instanceof Error ? error.message : "The tool could not complete." } }; }
}

export async function searchBlogDrafts(): Promise<AssistantToolResult> {
  return run(async () => {
    const user = await readPayloadSession();
    if (!user || user.role !== "admin") throw new Error("Not authorized");
    const payload = await payloadInstance();
    const result = await payload.find({ collection: "posts", where: { status: { not_equals: "published" } }, sort: "-updatedAt", limit: 20, depth: 1, draft: true, overrideAccess: false, user });
    return result.docs.map((post) => ({ id: post.id, title: post.title, status: post.status, slug: post.slug, updatedAt: post.updatedAt, categories: post.categories }));
  });
}

function lexicalText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; children?: unknown };
  return `${typeof node.text === "string" ? node.text : ""}${Array.isArray(node.children) ? node.children.map(lexicalText).join(" ") : ""}`;
}

export async function draftBlogPostSummary(postId: string): Promise<AssistantToolResult> {
  return run(async () => {
    const user = await readPayloadSession();
    if (!user || user.role !== "admin") throw new Error("Not authorized");
    const payload = await payloadInstance();
    const post = await payload.findByID({ collection: "posts", id: postId, depth: 1, draft: true, overrideAccess: false, user });
    const raw = post.lexicalContent ?? post.content;
    const text = lexicalText(raw).replace(/\s+/g, " ").trim();
    return { id: post.id, title: post.title, summary: text.slice(0, 400) };
  });
}
