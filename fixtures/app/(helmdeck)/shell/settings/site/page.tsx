// SPDX-License-Identifier: MIT

import { AdminSettingsPage, AdminThemePreference } from "@yesvus/helmdeck";
import { currentDemoSession } from "../../../../../lib/demo-session";
import {
  SETTINGS_FIELDS,
  SETTINGS_PATH,
  THEME_COLUMNS,
  readSiteSettingsAction,
  writeSiteSettingsAction,
  type Column,
} from "../../../../../lib/demo-settings";

/**
 * Site settings: the values the demo shows, read from the store and written back to it.
 *
 * This page used to offer a role switcher and an accent picker over local state, which made the
 * demo look configurable where nothing was configured, and became actively misleading once the
 * session became real: a role switcher in an admin interface offers a way to "become" an
 * administrator. The role is the stored user row's and it is not a setting, so it is shown and not
 * offered. The accent is now the stored value rather than a constant, which is why the shell reads
 * it too.
 *
 * The theme settings are the package's declared surface and are rendered from `THEME_COLUMNS`, which
 * is `ADMIN_THEME_SETTING_KEYS` filtered to the columns this table has. What a host may set about the
 * theme is the package's decision, and a page that picks its own subset is a page that quietly
 * offers less than the contract promises. What stays out is everything else the theme layer decides:
 * the colour mode, the individual brand variables, the radius and the type scale. Offering those
 * here would make this page a second source of truth for contrast the package already guarantees,
 * and a second source of truth is how a guarantee stops being one.
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
  // Only present when the field's own hint could not say why, which is the case where the value was
  // a colour and the package refused it anyway. A blank name arrives here with nothing to add.
  const reason = params.get("reason");
  const saved = params.get("saved") === "1";

  const themeFields = SETTINGS_FIELDS.filter((field) => THEME_COLUMNS.includes(field.column as Column));
  const siteFields = SETTINGS_FIELDS.filter((field) => !THEME_COLUMNS.includes(field.column as Column));

  return (
    <AdminSettingsPage
      sections={[
        {
          id: "appearance",
          title: "Appearance",
          description: "Choose the colour mode for this browser.",
          content: <AdminThemePreference />,
        },
        {
          id: "site",
          title: "Site settings",
          description: "These values are stored. The shell reads the same row, so changes apply across the site.",
          content: (
            <form action={writeSiteSettingsAction} className="space-y-6">
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-zinc-900">Site</legend>
                {siteFields.map((field) => (
                  <Field key={field.column} field={field} value={settings[field.column]} invalid={refused?.column === field.column} />
                ))}
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-zinc-900">Theme</legend>
                <p className="text-xs text-zinc-500">
                  Accent and density are stored with the site and applied by the shell.
                </p>
                {themeFields.map((field) => (
                  <Field key={field.column} field={field} value={settings[field.column]} invalid={refused?.column === field.column} />
                ))}
              </fieldset>

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
                  {refused.label} was not saved. {reason ?? refused.hint} Nothing was written.
                </p>
              )}
            </form>
          ),
        },
        {
          id: "account",
          title: "Account",
          content: (
            <>
              <p className="text-sm text-zinc-600">{session?.email ?? "Nobody is signed in"}</p>
              <p className="mt-2 text-xs text-zinc-500">
                Role: {session?.role ?? "none"}. It comes from the stored account and is not a setting.
              </p>
            </>
          ),
        },
      ]}
    >
      {settings.updated_at ? (
        <p className="text-xs text-zinc-500">
          Last changed {settings.updated_at}
          {settings.updated_by ? ` by ${settings.updated_by}` : ""}.{" "}
          <a href={SETTINGS_PATH} className="font-semibold text-brand-700 hover:underline">
            Reload
          </a>{" "}
          to read the row again.
        </p>
      ) : null}
    </AdminSettingsPage>
  );
}

type FieldOf = (typeof SETTINGS_FIELDS)[number];

/**
 * One setting, as the control its column needs.
 *
 * Split out so the two sections above read the same way and so the difference between a text field
 * and a list of choices is one branch rather than two copies of the label, hint and error wiring.
 */
function Field({
  field,
  value,
  invalid,
}: {
  field: FieldOf;
  value: string;
  invalid: boolean;
}) {
  const id = `setting-${field.column}`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {field.label}
      </label>
      {"choices" in field ? (
        <select
          id={id}
          name={field.column}
          defaultValue={value}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          className="w-full rounded-md border border-zinc-300 bg-admin-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        >
          {field.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.column}
          type="text"
          defaultValue={value}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          className={`w-full rounded-md border bg-admin-surface px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
            invalid ? "border-red-400" : "border-zinc-300"
          }`}
        />
      )}
      <p id={`${id}-hint`} className={`text-xs ${invalid ? "text-red-600" : "text-zinc-500"}`}>
        {field.hint}
      </p>
    </div>
  );
}
