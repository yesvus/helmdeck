"use server";

import { revalidatePath } from "next/cache";
import type { AdminFormActionState } from "@yesvus/helmdeck";
import { adminCollectionFirstProblem, adminCollectionValues } from "@yesvus/helmdeck";
import { persistence } from "./persistence";
import { getHostSession } from "./session";
import { exampleBlockDefinition, isValidExampleBlockId } from "./block-definition";

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

export async function saveContentBlocks(formData: FormData) {
  const session = await getHostSession();
  if (!session || session.role !== "editor") {
    return { status: "error" as const, message: "You are not authorized to edit content blocks." };
  }

  const rawBlocks = formData.getAll(exampleBlockDefinition.name);
  if (rawBlocks.length > 100) return { status: "error" as const, message: "A page can contain at most 100 blocks." };
  const blocks = adminCollectionValues(exampleBlockDefinition, formData);
  if (blocks.length !== rawBlocks.length) return { status: "error" as const, message: "The submitted block data is invalid." };
  if (blocks.some((block) => !isValidExampleBlockId(block.id))) {
    return { status: "error" as const, message: "Block identities must use at most 100 letters, numbers, underscores, or hyphens." };
  }
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    return { status: "error" as const, message: "Every block must have a unique identity." };
  }
  const problem = adminCollectionFirstProblem(exampleBlockDefinition, blocks);
  if (problem) return { status: "error" as const, message: problem.message };

  await persistence.update("content-blocks", "landing", blocks);
  revalidatePath("/admin/blocks");
  revalidatePath("/blocks-preview");
  return { status: "success" as const, message: "Content blocks saved." };
}
