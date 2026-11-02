// SPDX-License-Identifier: MIT

import { createAdminPayloadAuthStrategy, type AdminPayloadSessionReader } from "./bridge.js";
import { createAdminPayloadPagePublishHandler } from "./scheduling.js";
import { createAdminPayloadTheme, type AdminPayloadThemeComponents } from "./theme.js";

export function createAdminPayloadPreset({
  readSession,
  theme,
}: {
  readSession: AdminPayloadSessionReader;
  theme?: AdminPayloadThemeComponents;
}) {
  return {
    authStrategy: createAdminPayloadAuthStrategy({ readSession }),
    theme: createAdminPayloadTheme(theme),
    pagePublishTask: createAdminPayloadPagePublishHandler(),
  };
}
