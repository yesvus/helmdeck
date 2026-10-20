"use server";

import { revalidatePath } from "next/cache";
import type { AdminFormActionState } from "@yesvus/helmdeck";
import { adminCollectionFirstProblem, adminCollectionValues } from "@yesvus/helmdeck";
import { persistence } from "./persistence";
import { getHostSession } from "./session";
import { exampleBlockDefinition, isValidExampleBlockId } from "./block-definition";

const resourceNames = new Set(["projects", "orders"]);

function checkedResource(resource: string) {
  if (!resourceNames.has(resource)) throw new Error("This resource is not available in the example host.");
  return resource;
}

async function requireEditor() {
  const session = await getHostSession();
  if (!session || session.role !== "editor") throw new Error("You are not authorized to manage these records.");
}

function checkedResourceValues(resource: string, value: unknown): Record<string, string> {
  const fields = resource === "projects" ? ["name", "status", "owner"] : ["reference", "customer", "status"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Record values must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key))) {
    throw new Error("Record values contain an unsupported field.");
  }
  const checked = Object.fromEntries(fields.map((field) => {
    const entry = record[field];
    if (typeof entry !== "string" || entry.trim() === "" || entry.length > 120) {
      throw new Error(`The ${field} field must be a non-empty string of at most 120 characters.`);
    }
    return [field, entry.trim()];
  }));
  return checked;
}

export async function queryExampleResource(resource: string, query?: Record<string, unknown>) {
  await requireEditor();
  return persistence.query(checkedResource(resource), query);
}

export async function readExampleResource(resource: string, id: string) {
  await requireEditor();
  return persistence.read(checkedResource(resource), id);
}

export async function createExampleResource(resource: string, value: unknown) {
  await requireEditor();
  const checked = checkedResource(resource);
  return persistence.create(checked, checkedResourceValues(checked, value));
}

export async function updateExampleResource(resource: string, id: string, value: unknown) {
  await requireEditor();
  const checked = checkedResource(resource);
  if (!(await persistence.read(checked, id))) throw new Error("This record no longer exists.");
  return persistence.update(checked, id, { ...checkedResourceValues(checked, value), id });
}

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
