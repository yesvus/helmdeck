// SPDX-License-Identifier: MIT

/**
 * The demo's site settings: the three values it actually shows, stored and enforced.
 *
 * The set is three on purpose. The name, the accent and the support address are what the shell's
 * brand block, the settings page and the seeded posts already refer to, so persisting them turns
 * three things a person can change into real ones. A page that could set everything would be a
 * longer form over fields nothing reads, which is the trick the role switcher was: a control that
 * looks like it works.
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
import { normalizeHex } from "@yesvus/helmdeck";
import { demoCan } from "./demo-rules";
import { requireDemoSession } from "./demo-guard";
import { createResourceAction, readResourceAction, updateResourceAction } from "./resource-actions";

const RESOURCE = "site_settings";

/** The one row the table holds, which its primary key and CHECK refuse a second of. */
export const SETTINGS_ROW_ID = "site";

export const SETTINGS_PATH = "/shell/settings/site";

/** What a site reads as before anybody has changed it, and what a missing row falls back to. */
export const DEFAULT_SETTINGS = {
  name: "Northstar Supply",
  accent: "#b45309",
  support_email: "support@northstar.example",
} as const;

export type SiteSettings = {
  name: string;
  accent: string;
  support_email: string;
  updated_at: string;
  updated_by: string | null;
};

/**
 * The three columns a person sets, each with the one rule behind it.
 *
 * The rule is the same string whether it is the hint under the field or the reason a save was
 * refused, because a page that states one set of rules and enforces another is a page whose errors
 * cannot be acted on. `hint` is what the form shows; `rule` decides what may be stored; `normalise`
 * is the form that rule admits, applied to what was typed.
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
    hint: "A hex colour such as #b45309.",
    // Read through the package's own parser rather than a pattern of our own, so a value the shell
    // will read is a value the package would have produced, and `#b4530` is refused rather than
    // padded into a colour nobody chose. The stored form is the parser's, which is lower case:
    // the migration's CHECK admits no other form, so accepting upper case here without folding it
    // would hand the writer a constraint error in place of a message naming the field.
    rule: (value: string) => Boolean(normalizeHex(value)),
    normalise: (value: string) => normalizeHex(value) ?? value,
  },
  {
    column: "support_email",
    label: "Support email",
    hint: "An address like support@example.com.",
    // A shape check, not a parser: one `@`, no spaces, a dot in the domain, and the 254 characters
    // RFC 5321 allows. A stricter rule would refuse addresses that deliver.
    rule: (value: string) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 254,
  },
] as const;

type Column = (typeof SETTINGS_FIELDS)[number]["column"];

export type SettingsRefusal = { field: Column; message: string };

/**
 * A submitted form, as the three settings it is allowed to change.
 *
 * A field the form did not send is refused rather than defaulted. The form sends all three or the
 * person did not use this form, and a settings screen that fills a missing field in with a value
 * nobody chose is the same defect the role switcher had: a control that reports success over a
 * change that was not made.
 */
export function settingsFromForm(form: FormData): { ok: true; value: Record<Column, string> } | { ok: false; refusal: SettingsRefusal } {
  const value = {} as Record<Column, string>;

  for (const field of SETTINGS_FIELDS) {
    const sent = form.get(field.column);
    if (typeof sent !== "string") {
      return { ok: false, refusal: { field: field.column, message: field.hint } };
    }
    const trimmed = sent.trim();
    if (!field.rule(trimmed)) {
      return { ok: false, refusal: { field: field.column, message: field.hint } };
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

  return {
    ...value,
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
    redirect(`${SETTINGS_PATH}?refused=${parsed.refusal.field}`);
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
