// SPDX-License-Identifier: MIT
/**
 * The one path from this host's settings screen into Payload's `siteSettings` Global.
 *
 * A Global has no collection and no id, so it does not travel through the package's collection
 * bridge. The two guarded keys travel the same way they do there: `overrideAccess: false` and the
 * session's user, on every read and every write, so Payload's access functions stay the rule.
 */

import type { AdminPayloadUser } from "@yesvus/helmdeck";
import { AdminPayloadAccessRefused } from "@yesvus/helmdeck";

export const SITE_SETTINGS_GLOBAL = "siteSettings";

export type PayloadSiteSettings = {
  name?: string | null;
  accent?: string | null;
  support_email?: string | null;
  density?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

/** The slice of the Payload instance the settings module calls, and nothing more. Method-style so a
 * real instance, whose own args are typed against its config, satisfies the slice. */
export type PayloadLike = {
  findGlobal(args: { slug: string; [key: string]: unknown }): Promise<unknown>;
  updateGlobal(args: { slug: string; data: unknown; [key: string]: unknown }): Promise<unknown>;
};

export type ResolveUser = () => Promise<AdminPayloadUser | null>;

export type PayloadSettingsOptions = {
  payload: PayloadLike;
  resolveUser: ResolveUser;
};

const DENSITIES = new Set(["comfortable", "compact", "cosy"]);

export type PayloadSettingsProblem = { key: string; reason: string };

/** The schema and its validation stay the host's own; this is where the host declares them. */
export function validatePayloadSiteSettings(values: Record<string, unknown>): PayloadSettingsProblem[] {
  const problems: PayloadSettingsProblem[] = [];
  if (Object.prototype.hasOwnProperty.call(values, "name")) {
    const value = values["name"];
    if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 48) {
      problems.push({ key: "name", reason: "Name must be between 2 and 48 characters." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "accent")) {
    const value = values["accent"];
    if (typeof value !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
      problems.push({ key: "accent", reason: "Accent must be a 3 or 6 digit hex colour." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "support_email")) {
    const value = values["support_email"];
    if (typeof value !== "string" || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim())) {
      problems.push({ key: "support_email", reason: "Support email must be a valid address." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(values, "density")) {
    const value = values["density"];
    if (typeof value !== "string" || !DENSITIES.has(value)) {
      problems.push({ key: "density", reason: "Density must be comfortable, compact or cosy." });
    }
  }
  return problems;
}

async function userOf(options: PayloadSettingsOptions, operation: string): Promise<AdminPayloadUser> {
  const user = await options.resolveUser();
  if (!user) throw new AdminPayloadAccessRefused(operation);
  return user;
}

export async function readPayloadSiteSettings(options: PayloadSettingsOptions): Promise<PayloadSiteSettings> {
  const user = await userOf(options, "findGlobal");
  const found = await options.payload.findGlobal({
    slug: SITE_SETTINGS_GLOBAL,
    overrideAccess: false,
    user,
    depth: 0,
  });
  return found as PayloadSiteSettings;
}

export async function writePayloadSiteSettings(
  options: PayloadSettingsOptions,
  values: Record<string, unknown>,
): Promise<PayloadSiteSettings> {
  const user = await userOf(options, "updateGlobal");
  const problems = validatePayloadSiteSettings(values ?? {});
  if (problems.length > 0) {
    throw new Error(problems.map((problem) => `${problem.key}: ${problem.reason}`).join("; "));
  }
  const written = await options.payload.updateGlobal({
    slug: SITE_SETTINGS_GLOBAL,
    data: values ?? {},
    overrideAccess: false,
    user,
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
