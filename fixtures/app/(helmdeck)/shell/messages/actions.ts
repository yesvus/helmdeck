// SPDX-License-Identifier: MIT
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateResourceAction } from "../../../../lib/resource-actions";

export async function markMessageHandled(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0 || id.length > 256) throw new Error("The message id is invalid");
  await updateResourceAction("contact_messages", id, { status: "handled" });
  revalidatePath("/shell/messages");
  redirect(`/shell/messages/${encodeURIComponent(id)}`);
}
