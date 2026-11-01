// SPDX-License-Identifier: MIT
/**
 * The one path from this host's settings screen into Payload's `siteSettings` Global.
 *
 * Globals have no id to address, so they cannot travel the collection bridge; they travel the
 * globals side of the same module instead, which passes `overrideAccess: false` and the session's
 * user in the same place every other Payload call does. What this module adds is what the host
 * owns: the editable keys, the normalisation, the validation and the change stamps.
 */

import { AdminPayloadAccessRefused } from "@yesvus/helmdeck";
import {
  SITE_SETTINGS_BOUNDS,
  SITE_SETTINGS_EDITABLE_KEYS,
  SITE_SETTINGS_GLOBAL,
} from "./globals";

export { SITE_SETTINGS_GLOBAL };

export type PayloadSiteSettings = {
  name?: string | null;
  accent?: string | null;
  support_email?: string | null;
  density?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

/**
 * The globals side of the content module, so the module carries no direct Payload calls and the
 * overrideAccess guard stays where every other call's guard lives.
 */
export type PayloadSettingsStore = {
  get: (slug: string) => Promise<unknown>;
  set: (slug: string, data: Record<string, unknown>) => Promise<unknown>;
};

export type ResolveUser = () => Promise<{ id: string } | null>;

export type PayloadSettingsOptions = {
  store: PayloadSettingsStore;
  resolveUser: ResolveUser;
};

export type PayloadSettingsProblem = { key: string; reason: string };

/** Trim once, then validate and write the same strings the caller read back. */
export function normaliseSettings(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SITE_SETTINGS_EDITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(values, key) && typeof values[key] === "string") {
      out[key] = (values[key] as string).trim();
    }
  }
  return out;
}

const DENSITIES = SITE_SETTINGS_BOUNDS.densities;

const HEX_ACCENT = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function validatePayloadSiteSettings(values: Record<string, unknown>): PayloadSettingsProblem[] {
  const problems: PayloadSettingsProblem[] = [];
  if (Object.prototype.hasOwnProperty.call(values, "name")) {
    const value = values["name"];
    if (typeof value !== "string" || value.length < SITE_SETTINGS_BOUNDS.nameMinLength || value.length > SITE_SETTINGS_BOUNDS.nameMaxLength) {
      problems.push({ key: "name", reason: "Name must be between 2 and 48 characters." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "accent")) {
    const value = values["accent"];
    if (typeof value !== "string" || !HEX_ACCENT.test(value)) {
      problems.push({ key: "accent", reason: "Accent must be a 3 or 6 digit hex colour." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "support_email")) {
    const value = values["support_email"];
    if (typeof value !== "string" || !EMAIL.test(value)) {
      problems.push({ key: "support_email", reason: "Support email must be a valid address." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "density")) {
    const value = values["density"];
    if (typeof value !== "string" || !DENSITIES.includes(value as (typeof DENSITIES)[number])) {
      problems.push({ key: "density", reason: "Density must be comfortable, compact or cosy." });
    }
  }
  return problems;
}

async function userOf(options: PayloadSettingsOptions, operation: string): Promise<{ id: string }> {
  const user = await options.resolveUser();
  if (!user) throw new AdminPayloadAccessRefused(operation);
  return user;
}

export async function readPayloadSiteSettings(options: PayloadSettingsOptions): Promise<PayloadSiteSettings> {
  await userOf(options, "findGlobal");
  return (await options.store.get(SITE_SETTINGS_GLOBAL)) as PayloadSiteSettings;
}

export async function writePayloadSiteSettings(
  options: PayloadSettingsOptions,
  rawValues: Record<string, unknown>,
): Promise<PayloadSiteSettings> {
  const user = await userOf(options, "updateGlobal");
  const values = normaliseSettings(rawValues ?? {});
  const problems = validatePayloadSiteSettings(values);
  if (problems.length > 0) {
    throw new Error(problems.map((problem) => `${problem.key}: ${problem.reason}`).join("; "));
  }
  // Only the named keys travel, and the change stamps are the server's fact, not the caller's.
  const written = await options.store.set(SITE_SETTINGS_GLOBAL, {
    ...values,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  return written as PayloadSiteSettings;
}

export type PayloadSettingsHandler = {
  read: () => Promise<PayloadSiteSettings>;
  write: (values: Record<string, unknown>) => Promise<PayloadSiteSettings>;
  validate: (values: Record<string, unknown>) => PayloadSettingsProblem[];
  global: string;
};

export function createPayloadSiteSettings(options: PayloadSettingsOptions): PayloadSettingsHandler {
  return {
    read: () => readPayloadSiteSettings(options),
    write: (values) => writePayloadSiteSettings(options, values),
    validate: (values) => validatePayloadSiteSettings(values),
    global: SITE_SETTINGS_GLOBAL,
  };
}
