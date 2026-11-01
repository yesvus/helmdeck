// SPDX-License-Identifier: MIT
/**
 * The settings Payload owns on this host's behalf.
 *
 * A Global rather than a collection, because there is one of it and it has no identity to address:
 * the site's own settings are read and written as themselves, not as a row among others. The schema
 * and the validation live here, in the host config, and the shell reads the same document the
 * settings page writes. The shared bounds and the editable keys are named here so the server-side
 * validation in `lib/payload/settings.ts` cannot drift from the fields the config registers.
 */

import type { GlobalConfig } from "payload";
import { payloadAccess } from "./access.ts";

/** The slug both the config and the server path name. */
export const SITE_SETTINGS_GLOBAL = "siteSettings";

/** The bounds the field config and the server-side validation share, in one place. */
export const SITE_SETTINGS_BOUNDS = {
  nameMinLength: 2,
  nameMaxLength: 48,
  densities: ["comfortable", "compact", "cosy"],
} as const;

/** The keys a caller may set. `updated_at` and `updated_by` are stamped by the server alone. */
export const SITE_SETTINGS_EDITABLE_KEYS = ["name", "accent", "support_email", "density"] as const;

const HEX_ACCENT = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const siteSettingsGlobal: GlobalConfig = {
  slug: SITE_SETTINGS_GLOBAL,
  label: "Site settings",
  access: {
    read: payloadAccess("read"),
    update: payloadAccess("update"),
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      minLength: SITE_SETTINGS_BOUNDS.nameMinLength,
      maxLength: SITE_SETTINGS_BOUNDS.nameMaxLength,
      defaultValue: "Helmdeck Payload Host",
    },
    {
      name: "accent",
      type: "text",
      required: true,
      defaultValue: "#b45309",
      // The admin panel and REST reach this write inside the schema, and the server-action path
      // repeats the rule through the host's own validation; one colour toy must not accept prose.
      validate: (value: string | null | undefined) => {
        if (value !== null && value !== undefined && HEX_ACCENT.test(value.trim())) return true;
        return "Accent must be a 3 or 6 digit hex colour.";
      },
    },
    { name: "support_email", type: "email", required: true, defaultValue: "support@example.com" },
    {
      name: "density",
      type: "select",
      required: true,
      defaultValue: "comfortable",
      options: SITE_SETTINGS_BOUNDS.densities.map((density) => ({
        label: density.charAt(0).toUpperCase() + density.slice(1),
        value: density,
      })),
    },
    { name: "updated_at", type: "text", required: false },
    { name: "updated_by", type: "text", required: false },
  ],
};

export default siteSettingsGlobal;
