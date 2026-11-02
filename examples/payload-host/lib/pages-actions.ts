"use server";

import { revalidatePath } from "next/cache";
import { createAdminPayloadCollectionScheduler } from "@yesvus/helmdeck";
import { payloadContent, mutatePage } from "./payload/content";
import { readPayloadSession } from "./session";
import { can, principal } from "./rules";

type ActionResult = { ok: true } | { ok: false; error: string };

async function allowed(operation: "update" | "delete") {
  const user = principal(await readPayloadSession());
  return user && can(user, operation) ? user : null;
}

export async function removePage(id: string): Promise<ActionResult> {
  try {
    if (!id || !(await allowed("delete"))) return { ok: false, error: "Not authorized" };
    await mutatePage(id, "delete");
    revalidatePath("/admin/pages");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not delete this page" };
  }
}

export async function schedulePage(id: string, value: string): Promise<ActionResult> {
  try {
    if (!id || !(await allowed("update"))) return { ok: false, error: "Not authorized" };
    const publishedAt = new Date(value);
    if (!value || Number.isNaN(publishedAt.getTime())) return { ok: false, error: "Choose a valid date and time" };
    const user = await readPayloadSession();
    await createAdminPayloadCollectionScheduler({ content: await payloadContent(), resolveUser: async () => user, collection: "pages" }).schedule(id, publishedAt.toISOString());
    revalidatePath("/admin/pages");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not schedule this page" };
  }
}
