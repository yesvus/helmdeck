// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "@yesvus/helmdeck/baseline";
import { signInAction } from "../fixtures/app/(helmdeck)/login/actions";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import { demoCan, exposedResource } from "../fixtures/lib/demo-rules";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  SETTINGS_PATH,
  SETTINGS_ROW_ID,
  readSiteSettingsAction,
  writeSiteSettingsAction,
} from "../fixtures/lib/demo-settings";
import {
  createTursoPersistenceAdapter,
  resetTursoAdapterCache,
  type SqlClient,
} from "../fixtures/lib/turso-persistence";
import type { AdminSession } from "@yesvus/helmdeck";

/**
 * The site settings, checked at the server actions rather than at the view.
 *
 * The properties here are the ones a settings page can fake: a value that looks saved, a control
 * that changes state nobody stored, and a form that reports success over a write that was refused.
 * Every call goes through the same exported action a browser would post to, with the session the
 * signed cookie resolves to and nothing else, so a test that rendered the page would pass against a
 * demo whose settings were not stored at all.
 */

const request = vi.hoisted(() => ({ session: undefined as string | undefined }));

const guard = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public url: string) {
      super(url);
    }
  }
  return { RedirectSignal };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "helmdeck_session" && request.session !== undefined
        ? { name, value: request.session }
        : undefined,
    set: (name: string, value: string) => {
      request.session = value;
    },
    delete: () => {
      request.session = undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

const [owner, editor] = demoAccounts;
const store = demoPersistence().adapter;

async function signIn(account: { email: string }) {
  const result = await signInAction({ email: account.email, password: DEMO_PASSWORD }, "");
  expect(result.ok).toBe(true);
  return request.session;
}

/** A form post, which is what the page's action receives and the only shape a browser can send. */
function form(overrides: Record<string, string | null> = {}) {
  const data = new FormData();
  for (const field of SETTINGS_FIELDS) {
    const value = field.column in overrides ? overrides[field.column] : DEFAULT_SETTINGS[field.column];
    if (value !== null) data.set(field.column, value);
  }
  return data;
}

const changed = { name: "Northstar Supply", accent: "#0f766e", support_email: "help@northstar.test" };

/**
 * Posts the form and returns where the action sent the browser.
 *
 * The action always redirects, so the redirect is the outcome rather than an accident of a failure:
 * `?saved=1` is a stored row and `?refused=<field>` is a refusal, and a save that reported success
 * without one of them is exactly the defect this workstream is about.
 */
async function save(overrides: Record<string, string | null> = {}): Promise<string> {
  try {
    await writeSiteSettingsAction(form(overrides));
  } catch (cause) {
    if (cause instanceof guard.RedirectSignal) return cause.url;
    throw cause;
  }
  throw new Error("the settings action returned without redirecting");
}

/** Restores the seeded row, so a test that changed the settings cannot decide the next one. */
async function restoreSettings() {
  await store.delete("site_settings", SETTINGS_ROW_ID);
  await store.create("site_settings", { id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS });
}

/**
 * The account row, with the role it holds.
 *
 * The whole row, not just the role: an update replaces the record rather than merging into it, and the
 * accounts are what a sign-in now reads, so a role-only write would leave a row with no address and
 * no hash, which is answered exactly as an address nobody has. These tests change the role and
 * nothing else about the account.
 */
async function setRole(account: { id: string; email: string; role: string }, role: unknown) {
  await store.update("users", account.id, {
    id: account.id,
    email: account.email,
    role,
    password_hash: await publishedHash(),
  });
}

/** One hash for the file, because scrypt is deliberately slow and the password is the same one. */
let published: Promise<string> | null = null;
const publishedHash = () => (published ??= hashPassword(DEMO_PASSWORD));

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  // The whole row, not just the role: an update replaces the record rather than merging into it, so
  // a role-only reset would blank the email and leave a session that resolves to no account. The
  // address and the hash are written from the seed rather than from whatever the row holds, because a
  // test that changed a role replaced the row and the next test needs an account again.
  for (const account of demoAccounts) {
    await setRole(account, account.role);
  }
  await restoreSettings();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a settings change is stored rather than submitted", () => {
  it("answers the changed values on the next read, as a page reload does", async () => {
    await signIn(owner);
    expect(await save(changed)).toBe(`${SETTINGS_PATH}?saved=1`);

    // A separate read, not the write's return value. The reload is the claim being tested, and it
    // is the store answering rather than the component that posted the form.
    const after = await readSiteSettingsAction();
    expect(after).toMatchObject(changed);
    expect(after.updated_by).toBe(owner.email);
  });

  it("stores the row the demo starts with before anything is changed", async () => {
    await signIn(owner);

    const settings = await readSiteSettingsAction();
    expect(settings).toMatchObject(DEFAULT_SETTINGS);
    // Untouched means nobody is recorded as having changed it, so the page cannot claim a save
    // that did not happen.
    expect(settings.updated_by).toBeNull();
  });

  it("keeps the settings the shell reads in step with the settings the page writes", async () => {
    await signIn(owner);
    await save({ accent: "#b91c1c" });

    // The shell's layout reads the same action on the same request, so this is the value that
    // reaches the brand block rather than a second lookup of a different row.
    const forTheShell = await readSiteSettingsAction();
    expect(forTheShell.accent).toBe("#b91c1c");
  });

  it("sends an editor's save to the same row, so a second account cannot be given a private site", async () => {
    await signIn(owner);
    await save(changed);

    await signIn(editor);
    expect(await readSiteSettingsAction()).toMatchObject(changed);
  });
});

describe("the rule that guards the settings", () => {
  const admin: AdminSession = { email: owner.email, role: "admin" };
  const asEditor: AdminSession = { email: editor.email, role: "editor" };

  it("exposes site_settings through the same rule the product pages use", () => {
    // A private door for the settings would be a second rule, and two rules disagree.
    expect(exposedResource("site_settings")).toBe(true);
    expect(demoCan(admin, "site_settings.read")).toBe(true);
    expect(demoCan(admin, "site_settings.update")).toBe(true);
    expect(demoCan(asEditor, "site_settings.read")).toBe(true);
    expect(demoCan(asEditor, "site_settings.update")).toBe(true);
    // The editor's split holds here exactly as it does for a product: no deletes.
    expect(demoCan(asEditor, "site_settings.delete")).toBe(false);
    expect(demoCan(admin, "site_settings.delete")).toBe(true);
  });

  it("leaves the accounts and the sessions as unreachable as they were", () => {
    // Widening the exposed set to reach site_settings must not have widened it to anything else.
    expect(exposedResource("users")).toBe(false);
    expect(exposedResource("sessions")).toBe(false);
    expect(demoCan(admin, "users.read")).toBe(false);
    expect(demoCan(admin, "sessions.delete")).toBe(false);
  });

  it("leaves the editor unable to touch orders, and the roles test's split intact", () => {
    expect(demoCan(asEditor, "orders.read")).toBe(false);
    expect(demoCan(asEditor, "products.delete")).toBe(false);
    expect(demoCan(admin, "orders.read")).toBe(true);
  });
});

describe("what a session may do to the settings", () => {
  it("refuses the save to an editor only where the rule says so, and serves the read", async () => {
    await signIn(editor);

    // The editor's split is content, not administration: they can update settings and cannot
    // delete. Nothing on the page weakens that, because the page asks the same rule.
    expect(await readSiteSettingsAction()).toMatchObject(DEFAULT_SETTINGS);
    expect(await save(changed)).toBe(`${SETTINGS_PATH}?saved=1`);
    expect(await readSiteSettingsAction()).toMatchObject(changed);

    await setRole(editor, "admin");
    expect(await readSiteSettingsAction()).toMatchObject(changed);
  });

  it("refuses everyone, on both halves, when nobody is signed in", async () => {
    request.session = undefined;

    // The redirect rather than an error: a page that renders settings to a signed-out request is a
    // page that hands a workspace's name to whoever asks.
    await expect(readSiteSettingsAction()).rejects.toThrow(guard.RedirectSignal);
    await expect(writeSiteSettingsAction(form(changed))).rejects.toThrow(guard.RedirectSignal);
    // Refused before the write, so the stored row is the seeded one.
    expect(await store.read("site_settings", SETTINGS_ROW_ID)).toMatchObject(DEFAULT_SETTINGS);
  });

  it("refuses a session whose stored role is one the rule does not define", async () => {
    await signIn(editor);
    await setRole(editor, "superuser");

    // The read goes through the resource actions, so the refusal is the package's guard naming the
    // permission it was asked. The write is refused a step earlier, by the settings module's own check
    // on the same rule, and says so in its own words: two refusals of one question, and the one that
    // runs first is the host's.
    await expect(readSiteSettingsAction()).rejects.toThrow(
      "This session may not site_settings.read",
    );
    await expect(writeSiteSettingsAction(form(changed))).rejects.toThrow(
      /may not update site_settings/,
    );
  });
});

describe("a value outside its rule", () => {
  const refusedCases: Array<[string, Record<string, string | null>, string]> = [
    ["a name that is blank", { name: "   " }, "name"],
    ["a name that is one character", { name: "N" }, "name"],
    ["a name past the length the field states", { name: "x".repeat(49) }, "name"],
    ["an accent that is not a colour", { accent: "burnt orange" }, "accent"],
    ["an accent one digit short of a colour", { accent: "#b4530" }, "accent"],
    ["an accent that is a CSS keyword rather than a hex value", { accent: "teal" }, "accent"],
    ["a support address with no domain dot", { support_email: "support@northstar" }, "support_email"],
    ["a support address with two at signs", { support_email: "a@b@example.com" }, "support_email"],
    ["a support address that is a name rather than an address", { support_email: "the post room" }, "support_email"],
    ["a support address with a space in it", { support_email: "help desk@northstar.example" }, "support_email"],
    ["a field the form did not send at all", { accent: null }, "accent"],
  ];

  for (const [what, overrides, field] of refusedCases) {
    it(`refuses ${what}, and writes nothing`, async () => {
      await signIn(owner);
      const before = await store.read<Record<string, unknown>>("site_settings", SETTINGS_ROW_ID);

      // The reason travels on the URL, so the page can say which field to fix rather than
      // re-rendering as though the save worked. Which field is checked as well as the refusal, so
      // a change that refused everything for the wrong reason would not pass.
      expect(await save(overrides)).toBe(`${SETTINGS_PATH}?refused=${field}`);
      expect(await store.read("site_settings", SETTINGS_ROW_ID)).toEqual(before);
    });
  }

  it("stores an accent in the form the shell reads, folding what a person typed", async () => {
    await signIn(owner);

    // `#B45309` and `#b45309` are the same colour, and the migration's CHECK admits only the
    // second. Refusing the first would hand somebody a constraint error for typing capitals, and
    // storing it unchanged would make the write fail rather than the value being wrong.
    expect(await save({ accent: "#B45309" })).toBe(`${SETTINGS_PATH}?saved=1`);
    expect(await readSiteSettingsAction()).toMatchObject({ accent: "#b45309" });
    expect(await store.read<Record<string, unknown>>("site_settings", SETTINGS_ROW_ID)).toMatchObject({
      accent: "#b45309",
    });
  });

  it("names the field that was refused, so the page can point at it", async () => {
    await signIn(owner);

    // A form with three bad values reports one of them rather than all three, so the page has a
    // single field to mark. Which one is the first the form sends.
    expect(await save({ name: "", accent: "nope", support_email: "nope" })).toBe(
      `${SETTINGS_PATH}?refused=name`,
    );
    expect(await save({ name: "Northstar", accent: "nope", support_email: "nope" })).toBe(
      `${SETTINGS_PATH}?refused=accent`,
    );
    expect(await save({ name: "Northstar", accent: "#b45309", support_email: "nope" })).toBe(
      `${SETTINGS_PATH}?refused=support_email`,
    );
  });

  it("names every field the form can refuse, so no field is stored unchecked", () => {
    // Each field has a rule that can say no, which is what stops a setting from being a constant
    // with a text box in front of it.
    for (const field of SETTINGS_FIELDS) {
      expect(field.rule(DEFAULT_SETTINGS[field.column]), field.column).toBe(true);
      expect(field.rule(""), field.column).toBe(false);
      expect(field.hint.length, field.column).toBeGreaterThan(0);
    }
  });
});

describe("the database, not the application, has the last word", () => {
  /**
   * A real database with every migration applied.
   *
   * The in-memory adapter has no schema, so neither the column check nor a CHECK constraint exists
   * there. Asserting either of them against it would pass against a store that never enforces
   * anything, so these run against a file-backed libsql instead.
   */
  async function migrated() {
    const dir = mkdtempSync(join(tmpdir(), "helmdeck-settings-"));
    const client = createClient({ url: `file:${join(dir, "demo.db")}` });
    for (const name of readdirSync(join(process.cwd(), "fixtures/lib/migrations")).sort()) {
      await client.executeMultiple(
        readFileSync(join(process.cwd(), "fixtures/lib/migrations", name), "utf8"),
      );
    }
    resetTursoAdapterCache();
    const adapter = createTursoPersistenceAdapter(client as unknown as SqlClient);
    return {
      adapter,
      async close() {
        client.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it("refuses a write naming a column the settings table does not have", async () => {
    const { adapter, close } = await migrated();
    try {
      // A column the table lacks is refused by the schema check rather than pasted into the SET
      // list. A record's values are bound as parameters, but its keys are SQL, so this is the
      // boundary a settings write passes through on the way to a real database.
      await expect(
        adapter.update("site_settings", "site", { ...DEFAULT_SETTINGS, role: "admin" }),
      ).rejects.toThrow(/"role" is not a column of site_settings/);

      // The row is untouched rather than half written.
      expect(await adapter.read("site_settings", "site")).toMatchObject(DEFAULT_SETTINGS);
    } finally {
      await close();
    }
  });

  it("refuses every value the field rules refuse, from the column's own constraint", async () => {
    const { adapter, close } = await migrated();
    try {
      for (const bad of [
        { accent: "not a colour" },
        { accent: "#B45309" },
        { name: "" },
        { name: "x".repeat(49) },
        { support_email: "northstar" },
        { support_email: "a@b@example.com" },
      ]) {
        await expect(
          adapter.update("site_settings", "site", bad),
          JSON.stringify(bad),
        ).rejects.toThrow(/CHECK/);
      }

      // The rule holds because the schema enforces it, not because the row happened to survive.
      expect(await adapter.read("site_settings", "site")).toMatchObject(DEFAULT_SETTINGS);
    } finally {
      await close();
    }
  });

  it("seeds one settings row a migrated database already has, and refuses a second", async () => {
    const { adapter, close } = await migrated();
    try {
      // A database migrated but not yet seeded already has a site, so a demo somebody visits first
      // after a deploy does not render a blank form.
      const seeded = await adapter.query<Record<string, unknown>>("site_settings");
      expect(seeded).toHaveLength(1);
      expect(seeded[0]).toMatchObject(DEFAULT_SETTINGS);

      await expect(
        adapter.create("site_settings", { id: "other", ...DEFAULT_SETTINGS }),
      ).rejects.toThrow(/CHECK|UNIQUE/);
    } finally {
      await close();
    }
  });
});
