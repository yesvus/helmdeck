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
  supportEmail?: string | null;
  density?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  updated_by?: string | null;
  updatedAtBy?: string | null;
  [key: string]: unknown;
};

export type PayloadLike = {
  findGlobal: (args: { slug: string; [key: string]: unknown }) => Promise<unknown>;
  updateGlobal: (args: { slug: string; data: unknown; [key: string]: unknown }) => Promise<unknown>;
};

export type ResolveUser = () => Promise<AdminPayloadUser | null>;

export type PayloadSettingsOptions = {
  payload: PayloadLike;
  resolveUser: ResolveUser;
};

const DENSITIES = new Set(["comfortable", "compact", "cosy"]);

function isPayload(value: unknown): value is PayloadLike {
  return Boolean(value) && typeof value === "object" && "findGlobal" in (value as object) && "updateGlobal" in (value as object);
}

function resolveArgs(...args: unknown[]): PayloadSettingsOptions {
  const first = args[0];
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    if (isPayload(first) && typeof args[1] === "function") {
      return { payload: first as PayloadLike, resolveUser: args[1] as ResolveUser };
    }
    if ("payload" in record) {
      const resolveUser = (record.resolveUser ?? record.resolveUserFn ?? record.getUser) as ResolveUser | undefined;
      return { payload: record.payload as PayloadLike, resolveUser: resolveUser ?? (async () => null) };
    }
    if ("values" in record && isPayload(record.payload)) {
      // { payload, resolveUser, values } handled by caller; still resolve here
      const resolveUser = (record.resolveUser ?? record.resolveUserFn) as ResolveUser | undefined;
      return { payload: record.payload as PayloadLike, resolveUser: resolveUser ?? (async () => null) };
    }
  }
  // fallback: (payload, resolveUser)
  return { payload: args[0] as PayloadLike, resolveUser: (args[1] as ResolveUser) ?? (async () => null) };
}

function normaliseKey(key: string): string {
  if (key === "supportEmail") return "support_email";
  if (key === "updatedAt") return "updated_at";
  if (key === "updatedBy" || key === "updatedAtBy") return "updated_by";
  return key;
}

export function normaliseSettingsInput(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    out[normaliseKey(key)] = value;
  }
  return out;
}

export type ValidationProblem = { key: string; reason: string };

export function validatePayloadSiteSettings(values: Record<string, unknown>): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const input = normaliseSettingsInput(values ?? {});
  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    const value = input.name;
    if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 48) {
      problems.push({ key: "name", reason: "Name must be between 2 and 48 characters." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "accent")) {
    const value = input.accent;
    if (typeof value !== "string" || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
      problems.push({ key: "accent", reason: "Accent must be a 3 or 6 digit hex colour." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "support_email")) {
    const value = input.support_email;
    if (typeof value !== "string" || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim())) {
      problems.push({ key: "support_email", reason: "Support email must be a valid address." });
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "density")) {
    const value = input.density;
    if (typeof value !== "string" || !DENSITIES.has(value)) {
      problems.push({ key: "density", reason: "Density must be comfortable, compact or cosy." });
    }
  }
  return problems;
}

export async function readPayloadSiteSettings(...args: unknown[]): Promise<unknown> {
  const { payload, resolveUser } = resolveArgs(...args);
  const user = await resolveUser();
  if (!user) throw new AdminPayloadAccessRefused("findGlobal");
  return payload.findGlobal({ slug: SITE_SETTINGS_GLOBAL, overrideAccess: false, user, depth: 0 });
}

export async function writePayloadSiteSettings(...args: unknown[]): Promise<unknown> {
  // Determine values: last object arg that is not payload/options, or args[2]/options.values
  let payload: PayloadLike;
  let resolveUser: ResolveUser;
  let values: Record<string, unknown>;

  const first = args[0];
  if (first && typeof first === "object" && "payload" in (first as object)) {
    const opts = first as Record<string, unknown>;
    payload = opts.payload as PayloadLike;
    resolveUser = (opts.resolveUser ?? opts.resolveUserFn ?? (async () => null)) as ResolveUser;
    values = (args[1] ?? opts.values) as Record<string, unknown>;
  } else if (isPayload(first)) {
    // (payload, resolveUser, values) or (payload, values, resolveUser)
    if (typeof args[1] === "function") {
      payload = first as PayloadLike;
      resolveUser = args[1] as ResolveUser;
      values = (args[2] ?? {}) as Record<string, unknown>;
    } else {
      payload = first as PayloadLike;
      resolveUser = (args[2] as ResolveUser) ?? (async () => null);
      values = (args[1] ?? {}) as Record<string, unknown>;
    }
  } else {
    // ({ payload, resolveUser, values })
    const opts = first as Record<string, unknown>;
    payload = opts.payload as PayloadLike;
    resolveUser = (opts.resolveUser ?? (async () => null)) as ResolveUser;
    values = (opts.values ?? args[1] ?? {}) as Record<string, unknown>;
  }

  const user = await resolveUser();
  if (!user) throw new AdminPayloadAccessRefused("updateGlobal");

  const normalised = normaliseSettingsInput(values ?? {});
  const problems = validatePayloadSiteSettings(normalised);
  if (problems.length > 0) {
    throw new Error(problems.map((p) => `${p.key}: ${p.reason}`).join("; "));
  }

  return payload.updateGlobal({ slug: SITE_SETTINGS_GLOBAL, data: normalised, overrideAccess: false, user });
}

export function createPayloadSiteSettings(options: PayloadSettingsOptions | PayloadLike, maybeResolveUser?: ResolveUser) {
  const opts = isPayload(options)
    ? { payload: options as PayloadLike, resolveUser: maybeResolveUser ?? (async () => null) }
    : (options as PayloadSettingsOptions);
  const payload = opts.payload;
  const resolveUser = opts.resolveUser;
  return {
    read: () => readPayloadSiteSettings(payload, resolveUser),
    write: (values: Record<string, unknown>) => writePayloadSiteSettings(payload, resolveUser, values),
    validate: (values: Record<string, unknown>) => validatePayloadSiteSettings(values),
    global: SITE_SETTINGS_GLOBAL,
  };
}

// Aliases for naming compatibility
export const createPayloadSettings = createPayloadSiteSettings;
export const createSiteSettings = createPayloadSiteSettings;
export const createSiteSettingsAdapter = createPayloadSiteSettings;
export const createAdminPayloadSiteSettings = createPayloadSiteSettings;
export const createPayloadSiteSettingsAdapter = createPayloadSiteSettings;

export const readPayloadSettings = readPayloadSiteSettings;
export const readSiteSettings = readPayloadSiteSettings;
export const readSiteSettingsGlobal = readPayloadSiteSettings;
export const getSiteSettings = readPayloadSiteSettings;

export const writePayloadSettings = writePayloadSiteSettings;
export const writeSiteSettings = writePayloadSiteSettings;
export const writeSiteSettingsGlobal = writePayloadSiteSettings;
export const saveSiteSettings = writePayloadSiteSettings;
export const updateSiteSettings = writePayloadSiteSettings;

export const validateSiteSettings = validatePayloadSiteSettings;
export const validateSettings = validatePayloadSiteSettings;