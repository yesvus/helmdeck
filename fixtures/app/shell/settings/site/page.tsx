// SPDX-License-Identifier: MIT

import { FixtureCard } from "../../../../components/fixture-card";
import { currentDemoSession } from "../../../../lib/demo-session";
import { demoCopy } from "../../../../demo-copy";

/**
 * Site settings, showing the session's real values.
 *
 * This page used to offer a role switcher and an accent picker over local state, which made the demo
 * look configurable where nothing was configured. It became actively misleading once the session
 * became real: a role switcher in an admin interface offers a way to "become" an administrator.
 *
 * Editing real settings is a separate milestone, with persistence behind it. Until that exists the
 * honest page is one that shows what is actually true. The accent is read from the same constant the
 * shell uses rather than from the client context, because a server component cannot read one.
 */
const ACCENT = "#b45309";

export default async function SiteSettingsPage() {
  const session = await currentDemoSession();
  const copy = demoCopy.en.shellSettings;

  return (
    <FixtureCard title={copy.title}>
      <div className="space-y-6">
        <p className="text-sm text-zinc-600">{copy.description}</p>

        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="font-semibold text-zinc-900">Account</h2>
          <p className="mt-1 text-sm text-zinc-600">{session?.email ?? "Nobody is signed in"}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {copy.role}: {session?.role ?? "none"} · {copy.accent}: {ACCENT}
          </p>
        </section>

        <p className="text-xs text-zinc-500">
          These are the values this session actually has. Editing them, and persisting the result, is
          not built yet, and a control that changed local state would only look like it worked.
        </p>
      </div>
    </FixtureCard>
  );
}
