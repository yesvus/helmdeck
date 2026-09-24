"use server";

import { revalidatePath } from "next/cache";
import type { AdminFormActionState } from "@yesvus/helmdeck";
import { persistence } from "@/host/persistence";

export async function saveProfile(_state: AdminFormActionState, formData: FormData): Promise<AdminFormActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", feedbackKey: "", message: "Name is required." };
  await persistence.update("workspace-profile", "workspace", { name });
  revalidatePath("/admin");
  return { status: "success", feedbackKey: "", message: "Profile saved." };
}
