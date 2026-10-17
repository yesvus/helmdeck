// SPDX-License-Identifier: MIT
"use client";

import { AdminMediaLibraryPage } from "@yesvus/helmdeck";
import { demoMediaAdapter } from "../../../../media";

/**
 * The demo's media library, mounted as the route it is.
 *
 * The page this replaces hand-rolled a grid over four invented files. It now reads the demo's real
 * media store through the shipped component, so upload, browse, preview and delete are the package's
 * behaviour on the demo's assets rather than a picture of them.
 *
 * The demo's store answers everyone, and the rule this site ships has no media permissions of its own,
 * so no permission is named here. A host whose rule does name them passes them and the controls
 * follow the rule.
 */
export default function MediaLibraryPage() {
  // What this demo's store can actually keep, stated to the file picker rather than inferred after
  // the upload: an unstated accept list offers every file and labels the ones it cannot read.
  return <AdminMediaLibraryPage adapter={demoMediaAdapter} accept="image/*,application/pdf,video/*" />;
}
