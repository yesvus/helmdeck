// SPDX-License-Identifier: MIT

import type { ReactNode } from "react";
import { HELMDECK_VERSION } from "../version.js";

/**
 * The footer for a settings view, with the installed package version and an optional host-owned note.
 *
 * Hosts can use it on their own settings pages; `AdminSettingsPage` includes it automatically. The
 * version is read from the installed package build, not copied into the host's navigation or settings.
 */
export function AdminSettingsFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-admin-border pt-4 text-xs text-admin-muted">
      <span>
        Helmdeck <span className="tabular-nums">v{HELMDECK_VERSION}</span>
      </span>
      {children}
    </footer>
  );
}
