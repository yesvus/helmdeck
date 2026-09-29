// SPDX-License-Identifier: MIT

import type { ReactNode } from "react";
import { sampleNav } from "../../nav";
import { ShellClient } from "./shell-client";
import { requireDemoSession } from "../../lib/demo-guard";

/**
 * The shell, on a server component, so the session it renders is the real one.
 *
 * It was a client component holding a hardcoded session and a role switcher, which meant the sidebar
 * showed a person who was not signed in and signing out only cleared a local message. A framework
 * where the shell can be signed out of without ending the session is not one that logs people in.
 *
 * Resolution happens here, before anything renders, because a shell that paints and then discovers it
 * has no session is a flash of the wrong thing on every navigation.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const session = await requireDemoSession({ returnTo: "/shell" });

  return <ShellClient nav={sampleNav} session={session}>{children}</ShellClient>;
}
