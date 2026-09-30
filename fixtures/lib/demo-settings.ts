// SPDX-License-Identifier: MIT

/**
 * The demo's site settings: the values it actually shows, stored and enforced.
 *
 * The set is four on purpose. The name, the accent, the support address and the density are what the
 * shell's brand block, the settings page and the seeded posts already refer to, so persisting them
 * turns four things a person can change into real ones. A page that could set everything would be a
 * longer form over fields nothing reads, which is the trick the role switcher was: a control that
 * looks like it works.
 *
 * Two of the four are the theme settings the package declares in `ADMIN_THEME_SETTING_KEYS`, and the
 * page renders those from that list rather than from a subset written here, so the demo cannot
 * quietly offer less than the contract declares. What the package declares is what a host may set;
 * what the demo adds on top is the site's own business. The line between them is the package's, not
 * this page's.
 *
 * Every read and every write goes through `resource-actions`, which is the same boundary products
 * and orders use. The session is resolved there, `site_settings` is in that rule's exposed set, and
 * `users` and `sessions` are as unreachable through this page as they are through a product form.
 * The settings surface is not a second way into the store; it is the store, through the rule that
 * already governs it.
 *
 * `site_settings` is exposed and is not one of the administrator-only resources, so an editor may
 * read and update it exactly as they may for products, and cannot delete it. The role stays the
 * stored user row's, and nothing on this page can change it.
 *
 * The actions are marked individually rather than at the top of the file, because the file also
 * exports the rules, and a `"use server"` module may only export async functions.
 */

import { redirect } from "next/navigation";
import {
  ADMIN_DENSITIES,
  ADMIN_THEME_SETTING_KEYS,
  ADMIN_TEXT_CONTRAST,
  DEFAULT_ADMIN_DENSITY,
  isAdminDensity,
  normalizeHex,
  resolveAdminThemeSettings,
  type AdminDensity,
} from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { requireDemoSession } from "./demo-guard";
import { createResourceAction, readResourceAction, updateResourceAction } from "./resource-actions";

const RESOURCE = "site_settings";

/** The one row the table holds, which its primary key and CHECK refuse a second of. */
export const SETTINGS_ROW_ID = "site";

export const SETTINGS_PATH = "/shell/settings/site";

/**
 * What a site reads as before anybody has changed it, and what a missing row falls back to.
 *
 * The density is the package's own `DEFAULT_ADMIN_DENSITY` rather than a value written beside it,
 * so the demo cannot become the place the default is decided. It reads as `"comfortable"` today and
 * that is what `0009_site_density.sql` gave every existing row, but the reason it agrees is this
 * line, not the coincidence of two people writing the same word.
 */
export const DEFAULT_SETTINGS = {
  name: "Northstar Supply",
  accent: "#b45309",
  support_email: "support@northstar.example",
  density: DEFAULT_ADMIN_DENSITY,
} as const;

export type SiteSettings = {
  name: string;
  accent: string;
  support_email: string;
  density: AdminDensity;
  updated_at: string;
  updated_by: string | null;
};

/**
 * The density choices, taken from the package's own list rather than written out here.
 *
 * The labels are derived from the identifiers rather than kept in a table beside them, because a
 * list of three labels is a second thing to forget when the package adds a fourth density.
 */
const DENSITY_CHOICES = ADMIN_DENSITIES.map((density) => ({
  value: density,
  label: `${density.charAt(0).toUpperCase()}${density.slice(1)}`,
}));

/**
 * The four columns a person sets, each with the one rule behind it.
 *
 * The rule is the same string whether it is the hint under the field or the reason a save was
 * refused, because a page that states one set of rules and enforces another is a page whose errors
 * cannot be acted on. `hint` is what the form shows; `rule` decides what may be stored; `normalise`
 * is the form that rule admits, applied to what was typed.
 *
 * `explainRefusal` is for the refusals a hint cannot state on its own, which today is one: a colour
 * that is a hex value, reads as a colour, and is refused anyway because no label colour clears the
 * contrast floor on it. `tests/demo-theme-settings.test.tsx` drives that case end to end.
 */
export const SETTINGS_FIELDS = [
  {
    column: "name",
    label: "Site name",
    hint: "Between 2 and 48 characters.",
    rule: (value: string) => value.length >= 2 && value.length <= 48,
  },
  {
    column: "accent",
    label: "Accent",
    hint:
      `A 3 or 6 digit hex colour such as #b45309. It also has to clear ${ADMIN_TEXT_CONTRAST}:1 ` +
      "against white or the palette's ink, so the shell has a label colour to put on it.",
    // Read through the package's own parser rather than a pattern of our own, so a value the shell
    // will read is a value the package would have produced, and `#b4530` is refused rather than
    // padded into a colour nobody chose. The stored form is the parser's, which is lower case:
    // the migration's CHECK admits no other form, so accepting upper case here without folding it
    // would hand the writer a constraint error in place of a message naming the field.
    //
    // And then through the package's own answer to whether an accent may be used at all. That half
    // is what stopped this page from being a control that sometimes does nothing: the shell hands
    // the stored accent to `useAdminBranding`, which declines a mid-tone like #808080 and leaves
    // the token palette standing, so storing one used to succeed and change nothing visible.
    rule: (value: string) => Boolean(normalizeHex(value)) && !accentProblem(value),
    normalise: (value: string) => normalizeHex(value) ?? value,
    explainRefusal: (value: string) => (normalizeHex(value) ? accentProblem(value) : undefined),
  },
  {
    column: "support_email",
    label: "Support email",
    hint: "An address like support@example.com.",
    // A shape check, not a parser: one `@`, no spaces, a dot in the domain, and the 254 characters
    // RFC 5321 allows. A stricter rule would refuse addresses that deliver.
    rule: (value: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 254,
  },
  {
    column: "density",
    label: "Density",
    hint: "How much room the shell's controls take. It scales every spacing the package renders.",
    // The package's own predicate rather than an array membership test, so a density the package
    // adds is offered and accepted without this page being told, and one it removes is refused.
    rule: isAdminDensity,
    choices: DENSITY_CHOICES,
  },
] as const;

type Column = (typeof SETTINGS_FIELDS)[number]["column"];
export type { Column };

/** The theme settings the package declares, as the columns on this page that carry them. */
export const THEME_COLUMNS: readonly Column[] = ADMIN_THEME_SETTING_KEYS.filter((key) =>
  SETTINGS_FIELDS.some((field) => field.column === key),
);

/** What the package says is wrong with an accent, or undefined when it will take the value. */
function accentProblem(value: string): string | undefined {
  const { problems } = resolveAdminThemeSettings({ accent: value });
  return problems.find((problem) => problem.setting === "accent")?.reason;
}

export type SettingsRefusal = { field: Column; message?: string };

/**
 * A submitted form, as the four settings it is allowed to change.
 *
 * A field the form did not send is refused rather than defaulted. The form sends them all or the
 * person did not use this form, and a settings screen that fills a missing field in with a value
 * nobody chose is the same defect the role switcher had: a control that reports success over a
 * change that was not made.
 *
 * The refusal carries a message only where the field's hint cannot say what happened, which is the
 * case `explainRefusal` exists for. A blank name is fully described by the hint beside the field, so
 * nothing is added to it; a colour the contract refused needs the ratio the package measured, or the
 * person is told their hex colour was not saved without being told why a hex colour was not saved.
 */
export function settingsFromForm(form: FormData): { ok: true; value: Record<Column, string> } | { ok: false; refusal: SettingsRefusal } {
  const value = {} as Record<Column, string>;

  for (const field of SETTINGS_FIELDS) {
    const sent = form.get(field.column);
    if (typeof sent !== "string") {
      return { ok: false, refusal: { field: field.column } };
    }
    const trimmed = sent.trim();
    if (!field.rule(trimmed)) {
      const explained = "explainRefusal" in field ? field.explainRefusal(trimmed) : undefined;
      return { ok: false, refusal: { field: field.column, message: explained } };
    }
    // A field that declares how it is stored gets it; a field that does not is stored as typed,
    // because a form that rewrites a name is a form that changes what somebody wrote.
    value[field.column] = "normalise" in field ? field.normalise(trimmed) : trimmed;
  }

  return { ok: true, value };
}

/**
 * A stored row, or null when it is not one this screen would have written.
 *
 * A row the rules did not admit is treated as no row rather than as a failure, because a settings
 * page that refuses to render is a page nobody can repair, and the values it falls back to are the
 * ones the migration inserted.
 */
function asSettings(row: unknown): SiteSettings | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const value = {} as Record<Column, string>;

  for (const field of SETTINGS_FIELDS) {
    const stored = record[field.column];
    if (typeof stored !== "string" || !field.rule(stored)) return null;
    value[field.column] = stored;
  }

  // The same rule the loop above applied, stated again because `rule` is read through the union of
  // fields and a type predicate on one member of it does not narrow. Without a declared type on
  // `SiteSettings.density` this value would be a plain string by the time the shell used it.
  if (!isAdminDensity(value.density)) return null;

  return {
    ...value,
    density: value.density,
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    updated_by: typeof record.updated_by === "string" && record.updated_by ? record.updated_by : null,
  };
}

/**
 * The settings this site is running with.
 *
 * A server component calls this directly, so the shell's brand reads the stored value on the same
 * render that shows the page, with no client round trip in between.
 */
export async function readSiteSettingsAction(): Promise<SiteSettings> {
  "use server";
  const row = await readResourceAction(RESOURCE, SETTINGS_ROW_ID);
  return (
    asSettings(row) ?? {
      ...DEFAULT_SETTINGS,
      updated_at: "",
      updated_by: null,
    }
  );
}

/**
 * Stores the submitted settings, or refuses and changes nothing.
 *
 * The write carries only the three columns and the two this module owns, so a record naming a
 * column the table lacks is refused by the schema check on the way past rather than pasted into a
 * statement. The table's own CHECK constraints then refuse what the rules above would have let
 * through, which is what makes them a rule rather than a courtesy.
 *
 * A refusal redirects rather than returning, because a form action's return value never reaches a
 * server component, and a settings page that silently re-renders is how a failed save looks like
 * a successful one.
 */
export async function writeSiteSettingsAction(form: FormData): Promise<void> {
  "use server";
  // The operation being performed is checked before the read below decides how to write it, so a
  // refusal names the update a person asked for rather than the read that was an implementation
  // detail of it. The same rule, asked once more, not a second one.
  await requireUpdate();
  const parsed = settingsFromForm(form);
  if (!parsed.ok) {
    // The reason travels on the URL rather than in a return value, because a form action's return
    // value never reaches the server component that renders this page again. It is appended only
    // where the field's own hint cannot state the refusal, so a refusal a hint does cover produces
    // the same URL it always did.
    const reason = parsed.refusal.message
      ? `&reason=${encodeURIComponent(parsed.refusal.message)}`
      : "";
    redirect(`${SETTINGS_PATH}?refused=${parsed.refusal.field}${reason}`);
  }

  const existing = await readResourceAction(RESOURCE, SETTINGS_ROW_ID);
  const record = {
    ...parsed.value,
    // The session that made the change, read from the row behind the cookie rather than from
    // anything the form posted, so a person cannot sign a settings change as somebody else.
    updated_at: new Date().toISOString(),
    updated_by: await whoAmI(),
  };

  // Update in place when the row is there and create it when it is not, so a second settings row
  // is never introduced and the row a migration inserted keeps its identity.
  if (existing) {
    await updateResourceAction(RESOURCE, SETTINGS_ROW_ID, record);
  } else {
    await createResourceAction(RESOURCE, { id: SETTINGS_ROW_ID, ...record });
  }

  redirect(`${SETTINGS_PATH}?saved=1`);
}

async function requireUpdate(): Promise<void> {
  const session = await requireDemoSession({ returnTo: SETTINGS_PATH });
  if (!demoCan(session, "site_settings.update")) {
    throw new Error("This session may not update site_settings");
  }
}

/**
 * The signed-in account, for the record of who changed the settings.
 *
 * Read after the write has been authorised, and only to fill in a column nobody can set: a settings
 * form that asked for it would be asking a person to attest to their own identity.
 */
async function whoAmI(): Promise<string | null> {
  const { currentDemoSession } = await import("./demo-session");
  return (await currentDemoSession())?.email ?? null;
}
