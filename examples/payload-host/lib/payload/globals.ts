// SPDX-License-Identifier: MIT
/**
 * The settings Payload owns on this host's behalf.
 *
 * A Global rather than a collection, because there is one of it and it has no identity to address:
 * the site's own settings are read and written as themselves, not as a row among others. The schema
 * and the validation live here, in the host config, and the shell reads the same document the
 * settings page writes.
 */

import type { GlobalConfig } from "payload";
import { payloadAccess } from "./access";

/** The slug both the config and the server path name. */
export const SITE_SETTINGS_GLOBAL = "siteSettings";

export const siteSettingsGlobal: GlobalConfig = {
  slug: SITE_SETTINGS_GLOBAL,
  label: "Site settings",
  access: {
    read: payloadAccess("read"),
    update: payloadAccess("update"),
  },
  fields: [
    { name: "name", type: "text", required: true, minLength: 2, maxLength: 48, defaultValue: "Helmdeck Payload Host" },
    { name: "accent", type: "text", required: true, defaultValue: "#b45309" },
    { name: "support_email", type: "email", required: true, defaultValue: "support@example.com" },
    {
      name: "density",
      type: "select",
      required: true,
      defaultValue: "comfortable",
      options: [
        { label: "Comfortable", value: "comfortable" },
        { label: "Compact", value: "compact" },
        { label: "Cosy", value: "cosy" },
      ],
    },
    { name: "updated_at", type: "text", required: false },
    { name: "updated_by", type: "text", required: false },
  ],
};

export default siteSettingsGlobal;