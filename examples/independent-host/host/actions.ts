"use server";

import { revalidatePath } from "next/cache";
import type { AdminFormActionState } from "@yesvus/helmdeck";
import { persistence } from "@/host/persistence";
import { getHostSession } from "@/host/session";

export async function saveProfile(_state: AdminFormActionState, formData: FormData): Promise<AdminFormActionState> {
  const session = await getHostSession();
  if (!session || session.role !== "editor") {
    return { status: "error", feedbackKey: crypto.randomUUID(), message: "You are not authorized to edit this profile." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", feedbackKey: crypto.randomUUID(), message: "Name is required." };
  await persistence.update("workspace-profile", "workspace", { name });
  revalidatePath("/admin");
  return { status: "success", feedbackKey: crypto.randomUUID(), message: "Profile saved." };
}
