// SPDX-License-Identifier: MIT

import type { ReactNode } from "react";
import { sampleNav } from "../../nav";
import { ShellClient } from "./shell-client";
import { requireDemoSession } from "../../lib/demo-guard";
import { readSiteSettingsAction } from "../../lib/demo-settings";

/**
 * The shell, on a server component, so the session it renders is the real one.
 *
 * It was a client component holding a hardcoded session and a role switcher, which meant the sidebar
 * showed a person who was not signed in and signing out only cleared a local message. A framework
 * where the shell can be signed out of without ending the session is not one that logs people in.
 *
 * Resolution happens here, before anything renders, because a shell that paints and then discovers it
 * has no session is a flash of the wrong thing on every navigation.
 *
 * The accent is read here for the same reason. It used to be a constant in the client half, so the
 * settings page could offer a colour picker that changed nothing; it is now the stored value, and a
 * server component reads a row directly rather than through an action, because there is no client
 * boundary to cross. The value that reaches the brand block is the value the settings page writes.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const [session, settings] = await Promise.all([
    requireDemoSession({ returnTo: "/shell" }),
    readSiteSettingsAction(),
  ]);

  return (
    <ShellClient nav={sampleNav} session={session} accent={settings.accent} siteName={settings.name}>
      {children}
    </ShellClient>
  );
}
