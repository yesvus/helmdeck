// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DENSITIES,
  ADMIN_DENSITY_SCALE,
  ADMIN_THEME_SETTING_KEYS,
  AdminI18nProvider,
  DEFAULT_ADMIN_DENSITY,
  DEFAULT_ADMIN_THEME_SETTINGS,
  adminBrandVariables,
  resolveAdminThemeSettings,
  type AdminSession,
} from "@yesvus/helmdeck";
import { signInAction } from "../fixtures/app/login/actions";
import SiteSettingsPage from "../fixtures/app/shell/settings/site/page";
import ShellLayout from "../fixtures/app/shell/layout";
import { DEMO_PASSWORD, demoAccounts } from "../fixtures/lib/demo-accounts";
import { demoPersistence } from "../fixtures/lib/demo-persistence";
import {
  DEFAULT_SETTINGS,
  SETTINGS_PATH,
  SETTINGS_ROW_ID,
  readSiteSettingsAction,
  writeSiteSettingsAction,
} from "../fixtures/lib/demo-settings";
import { ensureDemoSeeded } from "../fixtures/lib/ensure-seeded";

/**
 * The theme surface a person sets, followed to the chrome it is supposed to change.
 *
 * The contract shipped first: `ADMIN_THEME_SETTING_KEYS` declares a density and an accent,
 * `resolveAdminThemeSettings` validates them and `AdminThemeSettingsProvider` puts them on the
 * document. Nothing in the demo offered them, so the surface a host is told it can set existed as
 * an export and not as a page.
 *
 * Three things make that gap easy to write a test which does not notice:
 *
 * A row written is not a row applied. The settings page and the shell read the same row, but a
 * control can write it and reach nothing, which is exactly what this demo's accent picker did while
 * it was a constant. So the shell is rendered and the document is read, rather than the store being
 * read and called proof.
 *
 * A refusal can be silent. `describeAccentRejection` exists because a mid-tone accent is a colour
 * and is refused anyway, so the page offers a control whose answer is no. Every assertion here about
 * a refusal reads both what the person is told and what the store holds, because either alone passes
 * against a control that did nothing and said nothing.
 *
 * A fallback can be invented. The demo has its own defaults, so "it renders something reasonable" is
 * not the claim. The claim is that the value it falls back to is the one the package declares.
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

/** The cookie jar, one function so the mock below and the session share below hand back the same. */
const jar = vi.hoisted(
  () => (): { get(name: string): { name: string; value: string } | undefined; set(name: string, value: string): void; delete(): void } => ({
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
);

vi.mock("next/headers", () => ({ cookies: async () => jar() }));

// The package reads its cookie through a dynamic `import("next/headers.js")`, and two of those
// issued in the same tick resolve to the real module rather than to the mock above. The real one
// throws outside a request scope, which the permission guard turns into a redirect to the sign-in
// page, so a layout that reads the session and the settings row in one `Promise.all` looks signed
// out. Sharing one in-flight read is what a request is anyway: one cookie, one session.
vi.mock("../fixtures/lib/demo-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fixtures/lib/demo-session")>();
  let inFlight: Promise<AdminSession | null> | null = null;
  return {
    ...actual,
    currentDemoSession: (options: Parameters<typeof actual.currentDemoSession>[0] = {}) =>
      (inFlight ??= actual.currentDemoSession(options).finally(() => {
        inFlight = null;
      })),
  };
});

// Two specifiers for navigation, because the settings module asks for `next/navigation` and the
// package's shell asks for `next/navigation.js`. The redirect throws either way: a guard that
// redirected for real would replace a failure with a Next.js error, and the settings action's own
// redirect is the outcome several of these tests read.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
}));

vi.mock("next/navigation.js", () => ({
  redirect: (url: string) => {
    throw new guard.RedirectSignal(url);
  },
  usePathname: () => "/shell/settings/site",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link.js", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// The sign-out and the permission rule reach the store, which a rendering test has no session for.
vi.mock("../fixtures/app/shell/sign-out-action", () => ({ signOutAction: vi.fn() }));
vi.mock("../fixtures/lib/demo-permissions", () => ({
  demoPermissionsAdapter: () => ({ can: () => true }),
}));

const [owner] = demoAccounts;
const store = demoPersistence().adapter;

/** An accent the contract takes, and one it refuses. The refused one is the package's own example. */
const CHOSEN = "#1d4ed8";
const REFUSED = "#808080";

function rootStyle(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

/** Server work runs with no window, because the session adapter refuses a browser-shaped global. */
async function onTheServer<T>(work: () => Promise<T>): Promise<T> {
  vi.stubGlobal("window", undefined);
  try {
    return await work();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function signIn() {
  const result = await onTheServer(() =>
    signInAction({ email: owner.email, password: DEMO_PASSWORD }, ""),
  );
  expect(result.ok).toBe(true);
  expect(request.session, "sign-in left no cookie behind").toBeTypeOf("string");
}

/** The names of the settable controls inside a fieldset, which is what the boundary is about. */
function controlNames(scope: HTMLElement): (string | null)[] {
  return [...scope.querySelectorAll("input, select")].map((control) => control.getAttribute("name"));
}

/**
 * The settings page as a person sees it, and the form it hands them.
 *
 * A fresh render every call rather than a rerender, because a reload is the thing under test: the
 * values on screen are the ones a read of the row produces, not the ones a component is holding.
 */
async function openSettingsPage(query: Record<string, string> = {}) {
  cleanup();
  const page = await onTheServer(() => SiteSettingsPage({ searchParams: Promise.resolve(query) }));
  const rendered = render(<AdminI18nProvider locale="en">{page}</AdminI18nProvider>);
  const form = rendered.container.querySelector("form");
  if (!form) throw new Error("the settings page rendered no form");
  return { ...rendered, form, user: userEvent.setup() };
}

/**
 * The shell, from the layout that reads the stored row, on the chrome it renders.
 *
 * `ShellLayout` rather than `ShellClient`: the wiring is where a stored value is most likely to stop
 * being read, and the layout is the component that reads it. Its element tree is rendered directly,
 * which is what a server component hands the browser anyway.
 */
async function openShell() {
  cleanup();
  const tree = await onTheServer(() => ShellLayout({ children: <p>Page content</p> }));
  const rendered = render(<AdminI18nProvider locale="en">{tree}</AdminI18nProvider>);
  await waitFor(() => expect(rootStyle("--admin-density")).not.toBe(""));
  return rendered;
}

/** The settings this site is running with, read the way the layout reads them. */
function readSettings() {
  return onTheServer(() => readSiteSettingsAction());
}

/** Posts a form the way a browser would, and returns where the action sent the browser. */
async function post(form: FormData): Promise<string> {
  try {
    await onTheServer(() => writeSiteSettingsAction(form));
  } catch (cause) {
    if (cause instanceof guard.RedirectSignal) return cause.url;
    throw cause;
  }
  throw new Error("the settings action returned without redirecting");
}

/** The search params of a redirect, which is the only channel a form action's outcome has. */
function queryOf(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "https://demo.invalid").searchParams);
}

async function restoreSettings() {
  await store.delete("site_settings", SETTINGS_ROW_ID);
  await store.create("site_settings", { id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS });
}

beforeEach(async () => {
  vi.stubGlobal("window", undefined);
  request.session = undefined;
  await ensureDemoSeeded();
  for (const row of await store.query<{ id: string }>("sessions")) {
    await store.delete("sessions", row.id);
  }
  await restoreSettings();
  document.documentElement.removeAttribute("style");
  // scrypt is deliberately slow and the seed hashes the demo password on the first run, so the
  // setup for these tests is measured in seconds rather than milliseconds.
}, 30_000);

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
});

describe("the settings page offers the theme surface the package declares", () => {
  it("offers density as the package's own list of choices", async () => {
    await signIn();
    const { getByLabelText } = await openSettingsPage();

    const density = getByLabelText("Density");
    // Read off the control rather than off the module, because the question is what a person can
    // pick. `ADMIN_DENSITIES` is the package's answer to that, and a demo listing its own three
    // would be right today and wrong the day a fourth is added.
    const offered = within(density)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(offered).toEqual([...ADMIN_DENSITIES]);
    // And it opens on what the row holds, not on whatever the first option happens to be.
    expect((density as HTMLSelectElement).value).toBe(DEFAULT_SETTINGS.density);
  }, 30_000);

  it("offers a control for every declared theme key and nothing beside them", async () => {
    await signIn();
    const { getByRole } = await openSettingsPage();

    // The declared keys named, so adding one to `ADMIN_THEME_SETTING_KEYS` fails here rather than
    // quietly producing a page that offers less than the contract promises. The filter in
    // `THEME_COLUMNS` is what would drop it, so this is the check that makes the filter honest.
    const theme = getByRole("group", { name: "Theme" });
    const declared = controlNames(theme).sort();
    expect(declared).toEqual([...ADMIN_THEME_SETTING_KEYS].sort());

    // The site's own values sit in their own fieldset, so a reader of the page can tell which
    // fields are the demo's business and which are the package's contract.
    const site = getByRole("group", { name: "Site" });
    expect(controlNames(site)).toEqual(["name", "support_email"]);
  }, 30_000);

  it("keeps out the theme decisions the package already makes", async () => {
    await signIn();
    const { container } = await openSettingsPage();

    // A page offering colour mode, a radius or a type scale is not offering more, it is becoming a
    // second source of truth for a contrast guarantee the package holds. The names are the ones
    // that would be the obvious way in, and the accent appears exactly once: one control for one
    // value, so there is no second answer to what the brand colour is.
    for (const field of container.querySelectorAll("input, select")) {
      const described = `${field.getAttribute("name")} ${field.getAttribute("aria-label") ?? ""}`;
      expect(described).not.toMatch(/mode|radius|font|scale|spacing|palette|contrast/);
    }
    expect(container.querySelectorAll('[name="accent"]')).toHaveLength(1);
  }, 30_000);
});

describe("a density and an accent set on the page reach the shell after a reload", () => {
  it("puts the stored density on the document root the spacing scale reads", async () => {
    await signIn();
    const { form, user, getByLabelText } = await openSettingsPage();

    await user.selectOptions(getByLabelText("Density"), "compact");

    // The values come out of the page's own form, so what is posted is what the person would have
    // submitted. A form built from the module would pass against a page whose control is unwired.
    const posted = new FormData(form);
    expect(posted.get("density")).toBe("compact");
    expect(await post(posted)).toBe(`${SETTINGS_PATH}?saved=1`);

    const reloaded = await openSettingsPage();
    expect(within(reloaded.container).getByLabelText("Density")).toHaveValue("compact");

    await openShell();
    // Not a check that the row says compact. The claim is that the chrome is spaced by it, and
    // `--admin-density` is what `tokens.css` remaps `--spacing` through.
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE.compact);
    expect(rootStyle("--admin-density")).toBe("0.85");
  }, 30_000);

  it("puts the stored accent on the document root the brand tokens read", async () => {
    await signIn();
    const { form, user, getByLabelText } = await openSettingsPage();

    const accent = getByLabelText("Accent");
    await user.clear(accent);
    await user.type(accent, CHOSEN);

    expect(await post(new FormData(form))).toBe(`${SETTINGS_PATH}?saved=1`);
    const reloaded = await openSettingsPage();
    expect(within(reloaded.container).getByLabelText("Accent")).toHaveValue(CHOSEN);

    await openShell();
    expect(rootStyle("--admin-brand-500")).toBe(CHOSEN);
    // The shell's own brand block reads the same value, so the sidebar and the document cannot
    // disagree about what colour the site is. Compared against what the package derives rather than
    // against a literal, because a literal here would pass against a shell that hard-coded it.
    expect(rootStyle("--admin-on-brand")).toBe(
      adminBrandVariables(CHOSEN)?.["--admin-on-brand"],
    );
  }, 30_000);

  it("survives the shell being torn down and rebuilt from the row, not the component's state", async () => {
    await signIn();
    const { form, user, getByLabelText } = await openSettingsPage();
    await user.selectOptions(getByLabelText("Density"), "spacious");
    expect(await post(new FormData(form))).toBe(`${SETTINGS_PATH}?saved=1`);

    // Two renders with the store untouched between them. A value held in a client component would
    // survive the first and be gone on the second, which is the difference between a setting and a
    // piece of state that happens to sit in a settings screen.
    await openShell();
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE.spacious);
    await openShell();
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE.spacious);
  }, 30_000);
});

describe("an accent the contract refuses is refused in the open", () => {
  /** A stored accent the shell can render, so a refusal has something to fail to change. */
  async function storeAnAcceptedAccent() {
    await signIn();
    const { form, user, getByLabelText } = await openSettingsPage();
    const accent = getByLabelText("Accent");
    await user.clear(accent);
    await user.type(accent, CHOSEN);
    expect(await post(new FormData(form))).toBe(`${SETTINGS_PATH}?saved=1`);
    return store.read<Record<string, unknown>>("site_settings", SETTINGS_ROW_ID);
  }

  /** The page as it comes back after the person submits, which is the refusal they are shown. */
  async function submitRefused() {
    const { form, user, getByLabelText } = await openSettingsPage();
    const accent = getByLabelText("Accent");
    await user.clear(accent);
    await user.type(accent, REFUSED);
    const url = await post(new FormData(form));
    return { url, page: await openSettingsPage(queryOf(url)) };
  }

  it("tells the person which colour was refused and the ratio that decided it", async () => {
    await storeAnAcceptedAccent();
    const { url, page } = await submitRefused();

    // The refusal names the field, so the page has one field to mark.
    expect(url).toContain("refused=accent");
    // And it carries the package's own sentence rather than a restatement of it. The measured ratio
    // is what makes the message actionable: "your hex colour was not saved" leaves a person
    // guessing at which of a dozen reasons they got it.
    const rejection = resolveAdminThemeSettings({ accent: REFUSED }).problems[0];
    expect(rejection.setting).toBe("accent");
    expect(new URL(url, "https://demo.invalid").searchParams.get("reason")).toBe(rejection.reason);

    const alert = within(page.container).getByRole("alert");
    expect(alert).toHaveTextContent("Accent was not saved.");
    expect(alert).toHaveTextContent(rejection.reason);
    expect(alert).toHaveTextContent("Nothing was written.");
    // Marked on the control as well as announced, because a message under a form is invisible to
    // somebody who navigated straight to the field they just typed in.
    expect(within(page.container).getByLabelText("Accent")).toHaveAttribute("aria-invalid", "true");
  }, 30_000);

  it("stores nothing, which a test that only checked the message would not notice", async () => {
    const before = await storeAnAcceptedAccent();
    await submitRefused();

    // The row, byte for byte. A refusal that normalised the value, wrote a default, or moved one
    // other column would all pass the message assertions above.
    expect(await store.read("site_settings", SETTINGS_ROW_ID)).toEqual(before);
    expect((await readSettings()).accent).toBe(CHOSEN);
  }, 30_000);

  it("shows the accent that was stored on the field rather than the one that was refused", async () => {
    await storeAnAcceptedAccent();
    const { page } = await submitRefused();

    // A colour picker that sometimes does nothing is what a person reports as a bug. The refusal is
    // legible in three places: the message, the field marked invalid, and the field showing what is
    // actually stored rather than the value that was turned down.
    expect(within(page.container).getByLabelText("Accent")).toHaveValue(CHOSEN);
    expect(within(page.container).getByLabelText("Accent")).not.toHaveValue(REFUSED);
  }, 30_000);

  it("leaves the shell showing the accent that was stored", async () => {
    await storeAnAcceptedAccent();
    await submitRefused();
    await openShell();

    // The document the chrome is styled from, which is the thing a refusal has to leave alone. A
    // page that reported the refusal and wrote the value anyway would pass the message assertions.
    expect(rootStyle("--admin-brand-500")).toBe(CHOSEN);
    expect(rootStyle("--admin-brand-500")).not.toBe(REFUSED);
  }, 30_000);

  it("refuses on the contrast floor rather than on how dull a colour looks", async () => {
    // A mid-tone grey is the band where neither label colour clears the threshold. A dark blue and
    // a pale amber sit either side of it and are both accepted, so a rule that turned away "dull
    // colours" would pass the refusal cases above and fail here, and a rule that turned away
    // nothing would fail the refusal cases above.
    expect(resolveAdminThemeSettings({ accent: REFUSED }).problems).toHaveLength(1);
    expect(resolveAdminThemeSettings({ accent: CHOSEN }).problems).toHaveLength(0);
    expect(resolveAdminThemeSettings({ accent: "#ffee88" }).problems).toHaveLength(0);
  });
});

describe("a stored value that is absent or unknown falls back to the contract's default", () => {
  it("names the package's default rather than one the demo wrote beside it", () => {
    // The demo has its own defaults for a reason, so "it renders something reasonable" would pass
    // against a page carrying its own density. This is the stronger claim, and it is checkable
    // because both values are in reach.
    expect(DEFAULT_SETTINGS.density).toBe(DEFAULT_ADMIN_DENSITY);
    expect(DEFAULT_ADMIN_THEME_SETTINGS.density).toBe(DEFAULT_ADMIN_DENSITY);
    // Comfortable is 1, which is the multiplier `tokens.css` declared before density was a setting,
    // so a site that stores nothing renders what it always rendered.
    expect(ADMIN_DENSITY_SCALE[DEFAULT_ADMIN_DENSITY]).toBe("1");

    // The demo's accent fallback is the colour the package's own palette ships, read back out of
    // the stylesheet rather than trusted as a second copy of it.
    const tokens = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
    expect(DEFAULT_SETTINGS.accent).toBe(/--admin-brand-500:\s*(#[0-9a-f]{6});/.exec(tokens)?.[1]);
    // And it is one the contract accepts, so the fallback is not itself something the shell refuses.
    expect(adminBrandVariables(DEFAULT_SETTINGS.accent)).not.toBeNull();

    // SQL cannot import the constant, so `0009_site_density.sql` writes the density list out. Both
    // halves of it are a second copy of something above, and both have to say the same thing: the
    // column's default is the contract's density, and its CHECK admits the contract's densities
    // rather than a subset. A migration that gained a fourth density and not this would refuse a
    // value the page offers.
    const migration = readFileSync(
      join(process.cwd(), "fixtures/lib/migrations/0009_site_density.sql"),
      "utf8",
    );
    expect(migration).toContain(`DEFAULT '${DEFAULT_ADMIN_DENSITY}'`);
    for (const step of ADMIN_DENSITIES) expect(migration).toContain(`'${step}'`);
  });

  it("falls back when the stored density is one the package does not know", async () => {
    await signIn();
    // A value from a shape that has since changed, which is how an unknown one actually arrives.
    // The in-memory adapter has no CHECK constraint, so this is a row the database would not have
    // allowed and the application still has to survive.
    await store.update("site_settings", SETTINGS_ROW_ID, { ...DEFAULT_SETTINGS, density: "cosy" });

    expect((await readSettings()).density).toBe(DEFAULT_ADMIN_DENSITY);
    await openShell();
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE[DEFAULT_ADMIN_DENSITY]);
  }, 30_000);

  it("falls back when the row predates density being a column at all", async () => {
    await signIn();
    const withoutDensity = { ...DEFAULT_SETTINGS };
    delete (withoutDensity as Record<string, unknown>).density;
    await store.delete("site_settings", SETTINGS_ROW_ID);
    await store.create("site_settings", { id: SETTINGS_ROW_ID, ...withoutDensity });

    // Not a crash, and not an undefined reaching the shell: the rest of the row is still the row.
    const settings = await readSettings();
    expect(settings.density).toBe(DEFAULT_ADMIN_DENSITY);
    expect(settings.name).toBe(DEFAULT_SETTINGS.name);

    await openShell();
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE[DEFAULT_ADMIN_DENSITY]);
    // The accent on the older row still reaches the chrome, because one absent column does not
    // discard the values that are there.
    expect(rootStyle("--admin-brand-500")).toBe(DEFAULT_SETTINGS.accent);
  }, 30_000);

  it("keeps the values it can read when one value is unrecognised", async () => {
    await signIn();
    // The row a person actually has: a good name and a good accent, beside a density from a shape
    // that has since changed. The whole-row fallback read this as no row at all, so the name the
    // operator typed was replaced by the migration's, for the sake of one field.
    // Deliberately not the defaults. `DEFAULT_SETTINGS.name` is "Northstar Supply", so a test that
    // used that name could not tell a preserved value from a discarded one, and passed against the
    // whole-row fallback it exists to catch.
    const named = { ...DEFAULT_SETTINGS, name: "Kestrel Freight", accent: CHOSEN };
    await store.delete("site_settings", SETTINGS_ROW_ID);
    await store.create("site_settings", {
      id: SETTINGS_ROW_ID,
      ...named,
      density: "cosy",
    });

    const settings = await readSettings();
    expect(settings.density).toBe(DEFAULT_ADMIN_DENSITY);
    // The two values that were readable are still the ones stored, not the defaults.
    expect(settings.name).toBe("Kestrel Freight");
    expect(settings.accent).toBe(CHOSEN);

    await openShell();
    expect(rootStyle("--admin-brand-500")).toBe(named.accent);
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE[DEFAULT_ADMIN_DENSITY]);
  }, 30_000);

  it("falls back for a row that is not a row at all", async () => {
    await signIn();
    await store.delete("site_settings", SETTINGS_ROW_ID);

    // A settings page that refuses to render is a page nobody can repair, so a missing row is the
    // defaults rather than an error. Asserted through the shell because that is where the answer
    // has to be usable.
    expect(await readSettings()).toMatchObject(DEFAULT_SETTINGS);
    await openShell();
    expect(rootStyle("--admin-density")).toBe(ADMIN_DENSITY_SCALE[DEFAULT_ADMIN_DENSITY]);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  }, 30_000);
});