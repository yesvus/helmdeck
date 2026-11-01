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
  return readPayloadSiteSettings({ payload, resolveUser: readPayloadSession });
}

export async function writePayloadSiteSettingsAction(values: Record<string, unknown>): Promise<PayloadSiteSettings> {
  const payload = await payloadInstance();
  return writePayloadSiteSettings({ payload, resolveUser: readPayloadSession }, values);
}