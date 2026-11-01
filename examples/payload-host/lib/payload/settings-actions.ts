// SPDX-License-Identifier: MIT
"use server";

import { payloadInstance } from "./content";
import { readPayloadSession } from "../session";
import {
  readPayloadSiteSettings,
  writePayloadSiteSettings,
  type PayloadSiteSettings,
} from "./settings";

export async function readPayloadSiteSettingsAction(): Promise<PayloadSiteSettings> {
  const payload = await payloadInstance();
  return (await readPayloadSiteSettings(payload, readPayloadSession)) as PayloadSiteSettings;
}

export async function writePayloadSiteSettingsAction(values: Record<string, unknown>): Promise<PayloadSiteSettings> {
  const payload = await payloadInstance();
  return (await writePayloadSiteSettings(payload, readPayloadSession, values)) as PayloadSiteSettings;
}