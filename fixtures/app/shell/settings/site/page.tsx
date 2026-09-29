// SPDX-License-Identifier: MIT

import { FixtureCard } from "../../../../components/fixture-card";
import { currentDemoSession } from "../../../../lib/demo-session";
import {
  SETTINGS_FIELDS,
  SETTINGS_PATH,
  readSiteSettingsAction,
  writeSiteSettingsAction,
} from "../../../../lib/demo-settings";

/**
 * Site settings: the three values the demo shows, read from the store and written back to it.
 *
 * This page used to offer a role switcher and an accent picker over local state, which made the
 * demo look configurable where nothing was configured, and became actively misleading once the
 * session became real: a role switcher in an admin interface offers a way to "become" an
 * administrator. The role is the stored user row's and it is not a setting, so it is shown and not
 * offered. The accent is now the stored value rather than a constant, which is why the shell reads
 * it too.
 *
 * A server component, so the values on screen are the ones the database holds when the request
 * arrives. A save redirects back here, and this page reads the row again on that request, which is
 * what makes "saved" mean stored rather than submitted.
 */
export default async function SiteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, settings, query] = await Promise.all([
    currentDemoSession(),
    readSiteSettingsAction(),
    searchParams,
  ]);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
  }

  const refused = SETTINGS_FIELDS.find((field) => field.column === params.get("refused"));
  const saved = params.get("saved") === "1";

  return (
    <FixtureCard title="Site settings">
      <div className="space-y-6">
        <p className="text-sm text-zinc-600">
          These three values are stored. The shell's brand reads the same row, so a change here is a
          change everywhere the site is named.
        </p>

        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="font-semibold text-zinc-900">Account</h2>
          <p className="mt-1 text-sm text-zinc-600">{session?.email ?? "Nobody is signed in"}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Role: {session?.role ?? "none"}. It comes from the stored account and is not a setting.
          </p>
        </section>

        <form action={writeSiteSettingsAction} className="space-y-4">
          {SETTINGS_FIELDS.map((field) => {
            const id = `setting-${field.column}`;
            const invalid = refused?.column === field.column;
            return (
              <div key={field.column} className="space-y-1">
                <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
                  {field.label}
                </label>
                <input
                  id={id}
                  name={field.column}
                  type="text"
                  defaultValue={settings[field.column]}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${id}-hint`}
                  className={`w-full rounded-md border bg-admin-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
                    invalid ? "border-red-400" : "border-zinc-300"
                  }`}
                />
                <p
                  id={`${id}-hint`}
                  className={`text-xs ${invalid ? "text-red-600" : "text-zinc-500"}`}
                >
                  {field.hint}
                </p>
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Save settings
            </button>
            {saved && !refused && (
              <p role="status" className="text-sm text-emerald-700">
                Saved. The page you are reading was rendered from the stored row.
              </p>
            )}
          </div>

          {refused && (
            <p role="alert" className="text-sm text-red-600">
              {refused.label} was not saved. {refused.hint} Nothing was written.
            </p>
          )}
        </form>

        {settings.updated_at && (
          <p className="text-xs text-zinc-500">
            Last changed {settings.updated_at}
            {settings.updated_by ? ` by ${settings.updated_by}` : ""}.{" "}
            <a href={SETTINGS_PATH} className="font-semibold text-brand-700 hover:underline">
              Reload
            </a>{" "}
            to read the row again.
          </p>
        )}
      </div>
    </FixtureCard>
  );
}
