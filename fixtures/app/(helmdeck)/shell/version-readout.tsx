// SPDX-License-Identifier: MIT
"use client";

import { HELMDECK_VERSION, useAdminShell } from "@yesvus/helmdeck";

/**
 * The version of the package, in the shell's own footer.
 *
 * `sidebarExtra` is the host's prop, so the placement is the host's call and the package supplies
 * only the string. A host that wants its own version in that space renders its own; this is the
 * demo answering "what am I looking at" for the library it is running on.
 *
 * The package is named in the readout rather than the number alone. A host's sidebar is the
 * natural home for that host's version, so a bare `0.4.0` there would be read as the host's and be
 * wrong, which is the same defect as a readout that says `0.0.0`: it looks like information.
 *
 * Hidden when the sidebar collapses, on the brand label's rule: at 76 pixels the number has nowhere
 * to go but over the edge of the panel.
 */
export function ShellVersionReadout() {
  const shell = useAdminShell();
  if (shell?.collapsed) return null;

  return (
    <p className="px-1 py-1 text-[10px] font-medium text-zinc-400">
      Helmdeck <span className="tabular-nums">v{HELMDECK_VERSION}</span>
    </p>
  );
}
