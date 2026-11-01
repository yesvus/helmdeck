// SPDX-License-Identifier: MIT
"use server";

import { revalidatePath } from "next/cache";
import { globalsContent } from "./content";
import { readPayloadSession } from "../session";
import {
  readPayloadSiteSettings,
  writePayloadSiteSettings,
  validatePayloadSiteSettings,
  normaliseSettings,
  type PayloadSettingsProblem,
  type PayloadSiteSettings,
} from "./settings";
import { requireAdminSession } from "@/lib/guard";

export async function readPayloadSiteSettingsAction(): Promise<PayloadSiteSettings> {
  return readPayloadSiteSettings({ store: globalsContent(), resolveUser: readPayloadSession });
}

export async function writePayloadSiteSettingsAction(values: Record<string, unknown>): Promise<PayloadSiteSettings> {
  return writePayloadSiteSettings({ store: globalsContent(), resolveUser: readPayloadSession }, values);
}

export type SaveSettingsState = {
  ok: boolean;
  problems: PayloadSettingsProblem[];
};

const OK_STATE: SaveSettingsState = { ok: true, problems: [] };

/**
 * The form's action: the host's validation answers in the state, so a refusal lands on the fields
 * rather than as a thrown production-redacted error page, and the shell re-renders so the brand
 * label picks the saved name up.
 */
export async function saveSettingsAction(_previous: SaveSettingsState, formData: FormData): Promise<SaveSettingsState> {
  await requireAdminSession({ returnTo: "/admin/settings" });
  const raw: Record<string, unknown> = {
    name: String(formData.get("name") ?? ""),
    accent: String(formData.get("accent") ?? ""),
    support_email: String(formData.get("support_email") ?? ""),
    density: String(formData.get("density") ?? ""),
  };
  const values = normaliseSettings(raw);
  const problems = validatePayloadSiteSettings(values);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  await writePayloadSiteSettings({ store: globalsContent(), resolveUser: readPayloadSession }, values);
  revalidatePath("/", "layout");
  return OK_STATE;
}
