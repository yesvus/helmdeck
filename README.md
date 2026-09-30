# Helmdeck

Helmdeck is a reusable, MIT-licensed admin interface package for Next.js App Router applications. It provides a responsive shell, accessible UI primitives, typed localization dictionaries, and adapter-backed media workflows while leaving authentication, data access, routes, and domain operations to the host application.

## Included

- Responsive shell with navigation, command search, breadcrumbs, profile actions, mobile navigation, and login presentation.
- Form workflows with dirty-state tracking, autosave support, pending buttons, repeaters, URL feedback, and status primitives.
- Data-heavy primitives including tables, pagination, modals, toasts, skeletons, sortable lists, and destructive confirmations.
- Charts drawn by the package with no charting dependency: a time series over days, a ranked bar chart, and the card they live in with its loading, empty and failed states.
- Six ready dashboard tiles (stat, table, list, time-series chart, ranked chart, activity feed) that render the engine's four states themselves, so a host registers a tile rather than writing one.
- Media upload, picker, single-value fields, gallery fields, placeholders, sorting, and adapter contracts.
- CSV export and import over the resource seam: the list a query names as a downloadable file, and a file read into the store a row at a time.
- English and Turkish dictionaries with formal Turkish UI copy. Register additional dictionaries with `defineAdminMessages`.
- A static bilingual fixture app for the hosted demo.
- A starter template in [`template/`](./template) that runs before you have written any of it: a sign-in, a generated list and form, a layout, one authorization rule, and a SQLite file it creates itself.

## Install

```bash
pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.4.0/yesvus-helmdeck-0.4.0.tgz
```

Release artifacts are distributed through GitHub releases. npm publication is postponed indefinitely.

## Releases

`VERSION` is the canonical release version and must match `package.json` and the install command above. The release workflow accepts explicit alpha, beta, stable, patch, minor, and major transitions, runs the full quality gate, tags the release, and attaches the package tarball with a SHA-256 checksum. Alpha and beta releases are marked as GitHub prereleases. Stable releases move the floating `v0` tag; prereleases leave it unchanged. Consumers should upgrade by replacing the exact release tarball URL and refreshing the lockfile.

A release rewrites the install command in the same commit as the version bump, so the documented URL never lags a release. Run `pnpm version:check` to verify version metadata locally; it fails when the three disagree. Use `pnpm version:next <bump>` to preview a transition without changing files. Notable changes for every version are recorded in [CHANGELOG.md](./CHANGELOG.md). Write pending notes under `## Unreleased`: the release stamps that heading with the version it is cutting, in the same commit as `VERSION`, `package.json` and the install command above, so the changelog cannot announce a release the rest of the repository does not agree has happened. A release with no `## Unreleased` section fails rather than cutting one silently.

### Pinning, upgrades, and rollback

Install an immutable release artifact by exact version and URL. Do not pin consumers to a moving branch, `latest`, or the floating `v0` tag. Verify the downloaded tarball against the SHA-256 checksum attached to its GitHub release, then commit the updated dependency and lockfile together. Deploy the same lockfile artifact through environments.

To upgrade, review the [release notes](./CHANGELOG.md) and the compatibility notes below, update the exact tarball URL, refresh the lockfile, and run the host's typecheck, tests, and production build before deployment. Roll back by restoring the previous exact artifact URL and lockfile from version control, then redeploy. Helmdeck does not modify its installed code or migrate host data.

Patch and minor releases preserve existing public APIs and adapter behavior. A breaking public API or adapter contract change requires a major-version transition and a migration note; prereleases may introduce such changes and are intended for evaluation. Release notes identify public API and adapter additions, deprecations, and breaking changes. Consumers should treat the TypeScript declarations shipped in each artifact as the contract for that version.

Import the theme tokens once in the host stylesheet, and point Tailwind at the installed package:

```css
@import "tailwindcss";
@source "../node_modules/@yesvus/helmdeck/dist";
@import "@yesvus/helmdeck/theme.css";
```

The `@source` line is what makes the components lay out. Helmdeck's own components are written with
Tailwind utilities, and Tailwind only generates a utility it finds in scanned source, so without this
line a host gets the design tokens and none of the layout: cards with no padding, grids that do not
grid, modals that do not centre. The path is relative to the stylesheet that declares it.

## Starter template

`template/` is a Next.js App Router project that runs before you have written any of it. Copy it, install, create one account, and you have a sign-in that checks a password against a stored hash, a resource whose list searches, sorts, filters and pages, a form generated from the same description, and a shell around both. There is no database to configure, no schema to design, and no migration to plan: the store is a SQLite file created on the first query, and moving it to a hosted one is two environment variables.

```sh
cp -r path/to/helmdeck/template my-admin && cd my-admin
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # into .env.local as HELMDECK_SESSION_SECRET
node scripts/create-user.mjs you@example.com admin
npm run dev
```

Read [`template/README.md`](./template/README.md) before building on it, because the list of what the template deliberately does not include is the part it cannot do for you.

**It exists because an example cannot do this job.** [`examples/independent-host/`](./examples/independent-host) is the working reference: 18 files that show the package's public exports and nothing else. What it cannot show is which parts are load-bearing, because an example is allowed to inline a rule to keep itself short, and a host that copies the inline rule has copied the shortcut rather than the seam. The template's one deliberate difference is that it has exactly one authorization rule, in `lib/rules.ts`, with no inlined shortcut anywhere else, and `tests/starter-template.test.ts` fails if a second one appears.

Three things in it are arranged so that the shortcuts are hard to write by accident, and each is worth knowing about on its own:

- The permission names live in `lib/resources.ts`, once, and the guard derives the name it asks about from a resource and an operation, so adding a resource cannot add a permission nothing decides.
- The exposed set of resource names is built from those definitions rather than listed again, so a resource cannot be reachable through the store and invisible to the rule.
- The accounts and the sessions are in the store and in no definition, which keeps a password hash out of a table browser that exists for everything else. That is a property of what is absent, not of a rule somebody has to remember.

The template ships no records, no fixture account and no password. The first row is created through the form, which is also how you find out the form works, and `scripts/create-user.mjs` is the only thing that writes an account: a registration route would be an unauthenticated write path you have to remember to close, and a printed password is a published credential.

`pnpm typecheck:template` compiles it after linking this repository into `template/node_modules`, which is what keeps a template nobody compiles from being copied stale. `examples/independent-host` is checked the same way by `pnpm typecheck:example`, and the two are separate scripts on purpose: a host copying the template gets a dependency manifest that resolves against an installed package rather than a link, and a single script that grew a second mode would have a failure message that could not say which tree broke.

## Themes and design tokens

Helmdeck defaults to the light theme and an accessible amber primary (`#b45309`). The host selects color mode by setting `data-admin-theme="light"` or `data-admin-theme="dark"` on the document root or an ancestor. The attribute can be rendered server-side to avoid a mode flash. Helmdeck does not persist theme choices; the host owns persistence and synchronization. Omit the attribute for the default light theme.

Theme CSS exposes `--admin-surface`, `--admin-surface-muted`, `--admin-surface-subtle`, `--admin-overlay`, `--admin-media-backdrop`, `--admin-border`, `--admin-border-strong`, `--admin-text-primary`, `--admin-text-secondary`, `--admin-text-muted`, `--admin-text-disabled`, `--admin-skeleton`, `--admin-brand-100`, `--admin-brand-500`, `--admin-brand-600`, `--admin-brand-text`, and `--admin-on-brand`. Feedback tokens are grouped by role: warning, danger, and success each define surface, text, and border tokens; danger and success also define action, action-hover, and action-foreground tokens. Typography, spacing, radius, and density are represented by `--admin-font-family`, `--admin-spacing`, `--admin-radius`, and `--admin-density`. `--admin-skeleton` is the loading-placeholder fill; it was previously sourced from `--admin-border-strong` via `bg-zinc-300`, so a host that retuned that token to change control borders was also changing its skeletons. Tailwind semantic utilities used by shared components resolve these values inline, so wrapper-level and tenant overrides flow through to the components. Override the variables on a host wrapper or `:root` to customize tenant branding. `useAdminBranding(accent)` returns the brand custom properties for a hex accent, or nothing at all when the accent is refused as described below.

Keep normal text/background combinations at WCAG AA contrast (4.5:1), and large text and the boundaries of interactive controls at 3:1. Control boundaries resolve to `--admin-border-strong`, which is held to 3:1 against `--admin-surface` in both themes. `--admin-border` draws card edges and section rules, which identify no control, so WCAG 1.4.11 does not apply to it and it is deliberately left lighter. `tests/theme-contrast.test.ts` asserts the 3:1 pair, records the ratio for `--admin-border`, and fails if any interactive element draws its boundary from that token. The default amber action color is `#b45309`, which exceeds 4.5:1 against white. All theme controls should remain native keyboard-operable inputs, selects, and buttons. The fixture at `/theme` demonstrates light, dark, and system mode, OS preference updates, live token editing, reset, and JSON preset import/export.

### Host settings

A host customises the theme through declared settings rather than by hand-editing tokens. `resolveAdminThemeSettings` takes whatever the host has stored, fills in the defaults, and reports each value it would not use.

| Setting | Accepted | Default | What it sets |
| --- | --- | --- | --- |
| `density` | `compact`, `comfortable`, `spacious` | `comfortable` | `--admin-density`, at 0.85, 1 or 1.15 |
| `accent` | 3 or 6 digit hex, or `null` | `null` | `--admin-brand-100`, `--admin-brand-500`, `--admin-brand-600`, `--admin-brand-text`, `--admin-on-brand` |

Wrap the admin in the provider and it writes the custom properties to the document root, and removes them again when it unmounts. Pass `target` to scope them to one subtree instead, and `mode` to pick the `--admin-brand-text` derivation for the colour mode in use.

```tsx
import { AdminShell, AdminThemeSettingsProvider } from "@yesvus/helmdeck";

export function AdminLayout({ children, nav, settings }: { children: ReactNode; nav: AdminShellNav; settings: unknown }) {
  return (
    <AdminThemeSettingsProvider settings={settings}>
      <AdminShell nav={nav}>{children}</AdminShell>
    </AdminThemeSettingsProvider>
  );
}
```

`useAdminThemeSettings()` reads what is applied and `setSettings` changes it, which is what a settings page needs. A rejected value leaves the default in place and arrives in `problems`:

```tsx
const { settings, problems, setSettings } = useAdminThemeSettings();

<select
  aria-label="Density"
  value={settings.density}
  onChange={(event) => setSettings({ density: event.target.value as AdminDensity })}
>
  {ADMIN_DENSITIES.map((step) => <option key={step}>{step}</option>)}
</select>
{problems.map((problem) => <p key={problem.setting}>{problem.reason}</p>)}
```

`adminThemeSettingsStyle(settings, mode)` returns the same custom properties as a plain style object, so a host that renders the document element on the server can avoid a flash without booting a client script:

```tsx
<html style={adminThemeSettingsStyle(resolveAdminThemeSettings(row).settings, mode)}>
```

Density reaches the rendered page through the Tailwind spacing multiplier, which the theme stylesheet points at `--admin-density`. `compact` shortens every padding, gap and fixed control height in the package by 15%, and `spacious` lengthens them by the same. Widths, type sizes and radii are not in that scale. It also covers the host's own components, because it is the spacing variable itself, and a host that sets its own `--spacing` replaces the effect.

An accent is refused when no label colour clears 4.5:1 on it or on the hover shade derived from it, which is what a mid-tone such as `#808080` runs into: it reads at 4.43:1 with ink and 3.95:1 with white, so no button label would be legible. A refused accent applies nothing, the palette in the theme stylesheet stands, and `problems` carries the ratio that decided it. The hover fill moves away from the label colour rather than always downward, so a light accent keeps a visible hover that stays legible, and `--admin-brand-text` is derived per mode for the same reason: the 80% accent mix the default palette uses reads at 0.5:1 on a white surface once the accent is light.

There is no surface setting. `--admin-surface` is the background every text token is measured against, so a host that changed it would move the whole palette outside what `tests/theme-contrast.test.ts` measures. Override the variable and the text tokens with it, and check the ratios for the values you shipped.

### A settings page that offers these

A host's settings page should offer exactly the keys in `ADMIN_THEME_SETTING_KEYS` and nothing else about the theme. Colour mode, the individual brand variables, the radius and the type scale stay with the shell: they are the package's to decide, and a control for one of them on a settings page is a second place to set it, which is how a guarantee stops being one. Read the declared list rather than a subset written beside it, so adding a key produces a page that offers less rather than one that quietly forgot.

The demo does this at `/shell/settings/site`. It stores the density beside the accent in one `site_settings` row, and the shell layout reads that row on the same request, so a change survives a reload rather than living in a component. The density reaches the document through the provider rather than a style attribute on one element, because `tokens.css` remaps `--spacing` through `--admin-density` and a value on one element leaves every element outside it at the default.

An accent the contract refuses is refused before it is stored, and the refusal is legible in three places: the field is marked invalid, the message carries the ratio `describeAccentRejection` measured, and the field re-renders holding the accent that is actually stored rather than the one that was turned down. The stored value does not move, so the shell keeps rendering the accent it had.

## Tone vocabulary

`danger` is the canonical spelling for the severity tone on `AdminStatCard`, `AdminStatusPill`, and `AdminBanner`. `error` is still accepted and renders identically, so existing code keeps compiling and nothing changes on screen.

The three tone types, `AdminStatCardTone`, `AdminStatusTone`, and `AdminBannerTone`, are the same union, `AdminTone`: `neutral`, `info`, `success`, `warning`, `danger`, and `error`. Type a shared helper against `AdminTone` and its result passes to any of the three, so a tone resolved once in host code is not re-typed per component.

```tsx
import { AdminBanner, AdminStatusPill, type AdminTone } from "@yesvus/helmdeck";

function toneForStatus(status: "healthy" | "degraded" | "failed"): AdminTone {
  if (status === "failed") return "danger";
  return status === "degraded" ? "warning" : "success";
}

<AdminStatusPill tone={toneForStatus(status)} label={status} />;
<AdminBanner tone={toneForStatus(status)} title="Health" body={status} />;
```

`AdminToastTone` is a narrower union of its own, covering only the tones a toast is shown in.

## Quick start

### The profile and settings routes

`AdminShell` points its profile entry at `${homeHref}/profile` when no `profileHref` is given, so mount `AdminProfilePage` there and the entry works with no wiring. `AdminSettingsPage` is a frame that takes sections as props, and is what `settingsHref` should point at.

```tsx
// app/admin/profile/page.tsx
<AdminProfilePage session={session} settingsHref="/admin/settings" onSignOut={signOut} />
```

The sign-out-everywhere control is yours to supply, because the auth contract decides what ending one account's own sessions means. Where you cannot honour one, the page leaves it out rather than rendering a control that does nothing. [Who may end every session](#who-may-end-every-session) and [Managing accounts](#managing-accounts) cover the two that ship.

### Dialog layout

`AdminModalContent` keeps its existing direct-child API, but it only bounds the height. `AdminModalBody` is the scroll container, so compose `AdminModalHeader`, `AdminModalBody`, and `AdminModalFooter` for anything taller than the dialog: the header and footer stay pinned while the body scrolls, and footer actions stack on narrow screens. Content placed directly in the dialog is clipped rather than scrolled, which keeps one scrollbar instead of two. Width belongs to the consumer: any `w-` or `max-w-` utility you pass, at any breakpoint, replaces the built-in default width rather than competing with it. The default is 32rem from the `sm` breakpoint up, the width shadcn/ui defaults a dialog to. Below `sm` the dialog spans the width less 1rem per side; above it the dialog is capped and centred, so the side margin grows with the viewport. Its height is capped at the smaller of 56rem and the viewport less 4rem, so the dialog keeps 2rem clear of the top and bottom edges whenever its content is tall enough to need that room. It also keeps 1rem clear of the side edges, unless you pair a `w-` with your own `max-w-`, in which case your max-width is the only bound and a fixed width can exceed a narrow viewport. Set `preventClose` while a submission is pending to block Escape, outside-click, and close-button dismissal. Destructive confirmations use `AdminDestructiveAction` and remain separate from ordinary dialogs.

```tsx
<AdminModalContent preventClose={saving}>
  <AdminModalHeader><AdminModalTitle>Edit record</AdminModalTitle></AdminModalHeader>
  <AdminModalBody><form>Form fields</form></AdminModalBody>
  <AdminModalFooter><button type="submit">Save</button></AdminModalFooter>
</AdminModalContent>
```

```tsx
import {
  AdminI18nProvider,
  AdminShell,
  type AdminNavGroup,
  type AdminSession,
} from "@yesvus/helmdeck";

export function AdminLayout({
  children,
  nav,
  session,
}: {
  children: React.ReactNode;
  nav: AdminNavGroup[];
  session: AdminSession;
}) {
  return (
    <AdminI18nProvider locale="tr">
      <AdminShell nav={nav} session={session} homeHref="/admin">
        {children}
      </AdminShell>
    </AdminI18nProvider>
  );
}
```

### Search params and static rendering

`AdminUrlFeedback`, `AdminManagedForm`, and `AdminRequireSession` read the query string, which opts them into dynamic rendering. On a statically generated page, wrap either one in a `<Suspense>` boundary:

```tsx
<Suspense fallback={null}>
  <AdminUrlFeedback />
</Suspense>
```

Without a boundary, the build fails and the component raises an error naming itself and the two ways to resolve it. Give the form's boundary a fallback that matches the form's own layout so nothing shifts on first paint, or opt the page out of static rendering with `export const dynamic = "force-dynamic"`.

`AdminUrlFeedback` can also be used with no boundary at all by supplying both `message` and `assetUrl`, which takes a path that reads nothing from the URL:

```tsx
<AdminUrlFeedback message="Saved" assetUrl="/uploads/chair.png" />
```

On that path the toast dismisses itself after `durationMs` instead of clearing query parameters. Because nothing is read from the URL, pass `status` to control the tone, since it would otherwise come from the `status` query parameter. Supplying only one of `message` and `assetUrl` still reads the query string for the other, so the boundary remains required.

### Testing against the package

The published `dist` is ESM and imports `next/link.js` and `next/navigation.js` with explicit extensions, so the barrel resolves under plain Node ESM. Importing `@yesvus/helmdeck` from a Node-environment test runner needs no extra configuration.

Shell and form components call Next.js navigation hooks, so tests that render them need the App Router context. Mock the module the same way the host's own components are mocked:

```ts
import { vi } from "vitest";

vi.mock("next/navigation.js", () => ({
  usePathname: () => "/admin/products",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
```

Primitives that do not touch routing, such as `defineAdminMessages` and `defaultAdminLocale`, import without any mock.

The host owns session resolution, authorization, persistence, route protection, and content-language state. Helmdeck receives configuration and callbacks through explicit props and adapters. Add an optional `icon` to each `AdminNavGroup` to identify sidebar categories. The first category is expanded initially, and groups remain collapsible when they contain the active route. Expanded groups use compact text-only sub-navigation with a vertical guide and a thicker animated indicator beside the active item. `AdminShell` scrolls its content region independently from the header; use its optional `contentScrollRef` to integrate host scroll restoration or scroll-to-top actions. Since the document itself no longer scrolls, call `scrollTo` on this element instead of `window.scrollTo`. The shell resets the region to the top when the route changes.

## Getting started: the admin baseline

Everything below is a working default, not a framework. Each piece satisfies the same contract a hand-rolled one does, so you adopt it where it fits and replace it where you have real differences. The hand-rolled path stays open at every step, and both are shown.

### Session and route protection

`AdminAuthProvider` resolves the session once at the root; `useAdminSession()` reads it. `AdminRequireSession` withholds a route tree until the session is known-good, then either renders it or announces a redirect. It does not render the children and hide them, because that would leave focusable controls in the tab order for a page the visitor may not have access to.

```tsx
<AdminAuthProvider adapter={auth}>
  <AdminRequireSession loginHref="/admin/login">{children}</AdminRequireSession>
</AdminAuthProvider>
```

The guard records where the visitor was headed in a `next` parameter. `adminReturnTo()` reads it back on the login page and returns a value only if that value is a plain same-site path **at every layer of encoding**, so a crafted link cannot turn the sign-in page into an open redirect. A `getSession()` that rejects produces an `error` status and an announcement, never a redirect, because bouncing a signed-in visitor to the login page on every transient failure is worse than saying so.

**Hand-rolled instead:** implement `AdminAuthAdapter` yourself and pass it. `AdminAuthProvider` has no opinion about where sessions live.

### Refusing a request on the server

`AdminRequireSession` decides what is drawn, which is not the same as refusing. A page it guards has already been sent to whoever asked for it, so the check that turns a request away belongs where a redirect is a response: a server component, a route handler or a server action. The module those three import carries no `"use client"`, so all of them can reach it.

Write the guard once, where the session is resolved, and call it at the top of a route:

```ts
// lib/session.ts
export const requireAdminSession = createAdminSessionGuard({
  session: currentSession,
  onUnauthenticated: ({ loginHref }) => redirect(loginHref),
});
```

```ts
// app/billing/page.tsx, a server component
const session = await requireAdminSession({ returnTo: "/admin/billing" });

// app/billing/actions.ts, "use server"
export async function chargeCard() {
  await requireAdminSession({ returnTo: "/admin/billing" });
}

// app/billing/route.ts, where the refusal is a 401 rather than a redirect
const session = await readAdminSession({ session: currentSession });
if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
```

`createAdminSessionGuard` returns the session or refuses, and `onUnauthenticated` is where the refusal is yours: a page throws a redirect, a handler throws a 401, and either may return instead, which still refuses with `AdminSessionRequiredError` so the work behind the guard is unreachable either way. The package imports no navigation module, so it does not choose the framework for you. `readAdminSession` is the same read without the refusal, for a handler that answers 401 rather than redirecting, and both go through one resolver, so a page, a handler and an action cannot disagree about who is signed in.

The session comes from **your** resolver and never from a cookie the package reads, so a token in a header, a row keyed by a device or a mobile session store is a session like any other. A read that throws is refused rather than reported as absent, and `onError` is where you log it.

`returnTo` is validated with the same rules as the login page's `next`, so a destination that leaves the origin is dropped to `/` before it reaches a redirect. The refusal carries the finished `loginHref` for exactly that reason: a host that assembled one from an unvalidated value would send a visitor to another origin.

**Hand-rolled instead:** call your resolver and refuse yourself, but validate `next` with `adminReturnTo()`, which this module exports. It is the same function the guard applies, and it is importable from a server module precisely because the destination rules do not live beside the browser's search-params hook.

### A baseline auth adapter

`createSessionAuthAdapter` signs the session id with HMAC-SHA256 over the Web Crypto API and puts it in an HTTP-only cookie. It owns the cookie's integrity; you own credential verification, user lookup, and session storage.

```ts
// A server action or route handler. The cookie is HTTP-only and next/headers is
// server-only, so this cannot run in a browser.
export const auth = createSessionAuthAdapter({
  secret: process.env.SESSION_SECRET,
  verify: async (credentials) => (await checkPassword(credentials)) ? newSessionId() : null,
  getUser: (id) => loadUser(id),
});
```

It is **server-side**, so pass it to a server action and hand `AdminAuthProvider` a thin client-side adapter that calls that, or supply the `cookie` option with your own store. Using it in a browser without one fails with a message saying exactly that, rather than resolving to nothing and looking like a signed-out visitor.

### A working sign-in

`createSessionAuthAdapter` is a signed cookie with nothing behind it. On its own, every host has to build a credential store, a session store, an expiry and a revocation before a person can sign in, which is the one part of authentication nobody should be hand-rolling. `createCredentialAuthAdapter` is that part, already built.

```ts
import { createCredentialAuthAdapter, createPersistenceCredentialStore } from "@yesvus/helmdeck/baseline";

const store = createPersistenceCredentialStore(persistence);

export const auth = createCredentialAuthAdapter({ secret: process.env.SESSION_SECRET, store });
```

Passwords are hashed with scrypt from Node core, one random salt per hash, stored as `scrypt$<salt>$<key>` so the cost parameters travel with the hash and can be raised later without invalidating the rows already written. A sign-in is a row behind the cookie, so clearing the cookie without deleting the row would leave a valid credential in someone's browser until it expired. The row's lifetime and the cookie's are the same number, so one lapses exactly when the other does.

`hashPassword` is what you call when a row is written, `verifyPassword` is the same check on its own for a host comparing a password against a hash it already holds, and `normalizeEmail` is how an address is stored. A row stored any other way is a row the sign-in will not find.

```ts
await persistence.create("users", {
  id: crypto.randomUUID(),
  email: normalizeEmail(input.email),
  password_hash: await hashPassword(input.password),
  role: "admin",
});
```

Four behaviours are worth knowing about, because each is the difference between a sign-in and an enumeration oracle, a sign-out that only clears one browser, and a session that never lapses:

- **An address with no account is answered exactly as a wrong password**, in message and in cost. The unknown path hashes a decoy through the same function, so the work done is the work a real verification does. A form that answers the two differently reports which addresses are registered.
- **Signing out ends the row, not just the cookie.** A cookie captured before a sign-out resolves to nothing afterwards, on any device.
- **A forged cookie is refused before the store is asked anything**, so it cannot be used to find out which session ids exist.
- **Expiry is checked on every read** and the row is deleted rather than left behind. An expiry that is not a number ends the session instead of reading as one that never lapses.

This is server-side and that is enforced rather than documented. `node:crypto` and `next/headers` are both things a browser does not have, so the credential path cannot be bundled for one, and a test builds it with a real bundler and calls the result rather than asserting it in a comment.

### Bounding the guesses on a login form

A password behind a public form is a password somebody will guess. The adapter takes a `throttle` and asks it **before** `verify`, so an attempt that is refused costs no scrypt and reveals nothing about whether the password was close:

```ts
import { createLoginThrottle } from "@yesvus/helmdeck/baseline";

export const auth = createCredentialAuthAdapter({
  secret: process.env.SESSION_SECRET,
  store,
  throttle: createLoginThrottle(),
});
```

Eight failures per key, then a refusal that names itself: `DEFAULT_THROTTLED_MESSAGE` is "Too many sign-in attempts. Wait a few minutes and try again.", and the defaults are `DEFAULT_THROTTLE_LIMIT` and `DEFAULT_THROTTLE_WINDOW_MS`. **The refusal is not the invalid-credentials message, on purpose.** "Too many attempts" and "wrong password" look identical to an attacker otherwise, so an attacker who cannot tell them apart does not know when to stop or when to change address, and a visitor who is being throttled cannot fix it by typing a different password. The window lapses when the key is next looked at: no timer, no sweep, and no interval for a host to remember to release. A refused attempt does not extend the window either, since that would be a way to hold an account locked for as long as an attacker cared to send.

**Attempts arriving together share one budget.** `check` is not a peek: returning null takes a slot for the key, and `failed` and `succeeded` are how the slot comes back. Without that, twenty requests sent at the same moment all read the same count before any of them has recorded a failure, so all twenty reach the password, and a bound that holds against a person typing is no bound at all against the shape an attacker actually uses. With it, at most `limit` of a burst reach the comparison. It costs nothing at the call site, because a sign-in reports exactly one of `failed` or `succeeded` and already did. Two consequences are worth knowing:

- **The take has to be atomic with the refusal.** The shipped one is, because a `Map` in one process gives it. A host over Redis needs its `GET` and its `SET` to be one script or one conditional `UPDATE`, since two callers reading the last free slot and both taking it is the same bypass with a network hop in it.
- **A slot that is never reported back lapses on its own**, or a request that dies between `check` and the comparison would hold the key below its limit for ever. The shipped throttle ages one out with the window, so a dead request costs the key the same one window a wrong password would have. `reservationMs` shortens that for a host that would rather a browser which gave up recover in seconds, at the price of a faster way for an attacker holding connections open to have their slots handed back, so it is the host's trade. There is no handle and nothing for a caller to release.

**What the default is not.** `createLoginThrottle` keeps its counts in a `Map` inside one process, so it is right for a single replica and wrong for a scaled one, it is lost on restart, and it is not a distributed rate limiter. The deployment decides which case the host is in, and only the host knows. On more than one process, implement `AdminLoginThrottle` yourself over Redis or a table and pass that: three methods, and nothing else in the package changes.

```ts
type AdminLoginThrottle = {
  check(attempt): Promise<string | null> | string | null;   // a message refuses, null proceeds and reserves a slot
  failed(attempt): Promise<void> | void;                      // refused: the slot it took stays charged
  succeeded(attempt): Promise<void> | void;                   // accepted: the slot comes back and the key is cleared
};
```

**What the key is, and what a client can do to it.** The default key is `forwardedClientKey`: the first address in `x-forwarded-for`, then `x-real-ip`, and the account being signed in to when neither arrived. The first address is the client, so a chain of proxies in front of it cannot be used to manufacture keys. That header is written by whatever is in front, though, so **a client that can set it can name a new key on every attempt and the bound bounds nothing.** Strip it at the edge and pass a `clientKey` built from the address the edge saw, or one the client cannot write at all. With no address to be had the attempt is keyed on the account, which is a real bound and a weaker one: it stops one account being guessed at and does not stop one client guessing at every account. `loginHeader` reads a header from either shape a request arrives in, so a host on `next/headers` and a host on a plain record share one key function.

A throttle does not become a way to find out which addresses have accounts. The count is keyed and moved without ever consulting the user store, so an address nobody holds accumulates failures exactly as one that does and is refused in exactly the same words. That is the decoy-hash property holding in the other direction, and it is the one most easily broken by adding a throttle: counting attempts through the account lookup would make an unknown address answer differently, and answering differently is the enumeration oracle.


**Hand-rolled instead:** write the six methods below and pass them to `createCredentialAuthAdapter`, or implement `AdminAuthAdapter` yourself and pass it to `AdminAuthProvider`. Nothing in the shell requires either.

### Who may end every session

`endAllSessions()` ends every session **the calling account** holds, on every device, and reports how many. It takes no account argument, and that is the design rather than an omission: the caller is the target, so the identity the rule decides on and the identity the rows belong to are the one value the adapter resolved from the signed cookie. A method that took an email would let a caller's authorization and its target be two different accounts, and no check inside it would close that.

Because the package has no vocabulary for roles, who may is yours:

```ts
export const auth = createCredentialAuthAdapter({
  secret: process.env.SESSION_SECRET,
  store,
  mayEndAllSessions: (session) => session.role === "admin",
});
```

The session it is given is the one the cookie named, and its role is read from the user row, so a request cannot write it. **Omit the option and the capability is refused**, so a host that has not thought about who may revoke does not ship it by accident. A refusal is reported as a refusal rather than as a count of zero, and it happens before any session row is looked up or deleted, so a refused call cannot be used to learn which accounts exist.

This method is about ending your own sessions everywhere. Ending *other* accounts' sessions, and everything else an operator does with other people's accounts, is [the account surface](#managing-accounts).

### Managing accounts

A sign-in is the hard half of operator onboarding and the store already had it. The easy half is six operations over the same store, which is what `createAccountAdmin` is:

```ts
import { createAccountAdmin } from "@yesvus/helmdeck/baseline";

export const accounts = createAccountAdmin(store, {
  roles: ["admin", "editor"],
  may: {
    list: (session) => session.role === "admin",
    create: (session) => session.role === "admin",
    setRole: (session, accountId) => session.role === "admin",
    setDisabled: (session, accountId) => session.role === "admin",
    listSessions: (session) => session.role === "admin",
    endSession: (session) => session.role === "admin",
  },
});
```

`list`, `create`, `setRole`, `setDisabled`, `listSessions` and `endSession` each take the caller's session and return `{ ok: true, ... }` or `{ ok: false, message }`. The two predicates that need to decide about one record are handed its id rather than the row, so the question is asked before the store is reached; a host that wants to decide on the record looks it up in its own rule, which is where a store read belongs. **Every predicate is a host policy and absent means refused**, for the same reason as `mayEndAllSessions`. The package has no vocabulary for roles, so `may` is the only thing that knows what one is.

Three decisions are worth stating, because each is the other answer too.

**A role the host's rule does not define still signs in, and the rule is what refuses it.** The package stores a role as a string and never interprets one, so there is nothing here to refuse a sign-in with, and a rule that does not define a role grants it nothing anyway. The `roles` list is a typo-catcher consulted on the two writes that name a role, refused with the name and the list; it is not a gate on signing in. The alternative costs the person at the keyboard a login failure with a reason they cannot see, where a login that succeeds into an admin showing nothing is a rule the host can be asked about. A host that has declared no `roles` at all has said what none of its roles are, so any string is written and its own rule decides.

**Turning an account off ends that account's sessions first, then flips the flag, and reports what it measured.** The order is the point. Ending the sessions and turning the account off are two writes, and which goes first decides what a failure leaves behind: revoke first and a store that cannot delete leaves the account still on, which is the state you asked to change away from and a retry can repeat. The other order leaves an account that is off with a session still live and a caller holding an exception rather than an answer.

The count is measured, not believed. A store's own number is a claim about the store, and one that had not checked would put a "done" in your admin screen for somebody who is still signed in. So the sessions are counted before and after the delete, and any that survived is a refusal with `reason: "sessions-survived"` rather than a count. A store with no `listSessions` cannot be checked from here, and `ended` is `null` for that reason: a number it volunteered is still only its claim.

**One row can outlive a disable, and it is a row rather than a credential.** The sign-in checks the password, then writes a session row. If the disable lands between those two, the row is written for an account that is now off. Two things bound that, and both are properties rather than intentions:

- **The row cannot be used.** Every read of a session resolves the account, and a disabled account is refused and the row deleted with the refusal, so the next thing that presents it is refused and the row goes. It is also the only way to reach a row like that: nothing mints a cookie for a session nobody resolved, so a row nobody presents is a row nobody can use.
- **On this package's sign-in path there is no window at all**, because `login` asks for the session after the write, so the refusal and the delete happen inside that one call and the table is left empty. A leftover row only comes from a caller writing session rows itself, through `store.createSession`, which is a host with its own session management.

What is left is a row that expires on its own, is visible in `listSessions` with `disabled: true` beside it, can be ended by its id like any other, and is counted and ended by the next disable of the same account. That is the whole cost, and a sweep is not worth it: the rows have an expiry the read already checks, so a sweep would only reclaim rows nobody presents, and it would put a clock and a background job inside a package that has none.

There is no re-check inside `createSession`, and that is a decision rather than an oversight. A re-check is a check followed by a write, so the disable can still land between them: it narrows the window and does not close it, and calling it a close would be the same claim this README refuses about `createUser`'s duplicate check. It would also add a third read of the account to every sign-in, where the second read already refuses and deletes. **A host writing its own session rows inherits this shape and owns the re-check**, because a host that manages its own sessions already owns what makes one valid.

**A disable does not reach a session that is already resolved.** Every read of a session goes through the store, which sees the flag, refuses, and deletes the row with the refusal, so the next request on a disabled account is refused and a replayed cookie resolves to nothing. But two things hold a session value past that moment, and neither is a credential that keeps working:

- **A server action that reads the session once and uses the value** for the rest of its request. `createAdminPermissionGuard` and `createAdminPermissionCheck` are handed a `session` resolver, so wiring them to a function that resolves per call gives you the store's answer every time, and wiring them to a captured value gives you the value you captured. The window is the request.
- **`AdminAuthProvider` holds the session in browser state** until the host calls its `refresh`. A tab that was signed in when the account was disabled keeps rendering the shell's chrome until something re-reads it, and the server refuses everything it tries to do. Call `refresh()` when your admin screen shows a session it should not.

Neither is a hole, and a value already resolved is a claim about a moment. It is stated here because a read-path check that is not described as having a window reads as a guarantee it is not.

**Turning an account off is a flag, and it ends the sessions that account holds.** Not a delete, which orphans every row the account authored and the trail describing what it did, and which cannot be undone. The sessions go in the same operation, because a disabled account whose live session keeps working is a disabled account with a hole in it. The check is on the read as well as on the sign-in, since a sign-in already in flight writes its row after the disable has run, and the row is deleted with the refusal. A disabled account answers the sign-in exactly as a wrong password does, in message and in cost, so the form is not an oracle for which accounts are turned off. Turning it back on ends nothing and says so with a count of zero.

**`AdminSession` gained an optional `id`, and it is off unless you ask.** The id is the session row's, read from the row the signed cookie names, so a request cannot write it. Pass `includeSessionId` to `createCredentialAuthAdapter` and the session your server action already resolved carries it, which is what lets a sessions list mark the caller's own row and lets `endSession` be called with an id you are already holding:

```ts
export const auth = createCredentialAuthAdapter({ secret, store, includeSessionId: true });
```

It is optional because a host with no session table has no id to have, so widening the type is what lets a host that does have one address a session at all. The migration is that option: a host that turns it on gets an `id` on its session and marks one row current; a host that does not is unaffected, because the field is absent rather than present and empty, so a session that was `{ email, role }` is still exactly that.

A session that has already ended is a success with `ended: false`, not a refusal. Two browsers pressing the same button is the ordinary case and neither of them did anything wrong, and a refusal would train a host to retry and to show an error for a revoke that worked.

Every refusal carries a `reason` beside its `message`: `no-session`, `not-permitted`, `no-account`, `store-unsupported`, `unknown-role`, `weak-password` or `email-taken`. The message is for the person who asked and the reason is for you, so an admin screen that renders "already invited" differently from "could not create" switches on a value rather than matching on prose.

**Two people inviting the same address at once produce one account and one refusal.** The read that checks for an existing account is a read followed by a write, so it is not what makes that true, and the comment in the source says so rather than claiming the index does a job it may not be doing. What makes it true is that `create` serialises per normalised address within a process, and that `createUser` on the store is documented to refuse a duplicate address itself by throwing `AccountAlreadyExistsError`, which `create` turns into the same `email-taken` refusal either path reaches. Anything else a store throws is let through, because a refusal that reported success over a broken database would be worse than an exception.

**An address is folded, on the way into the store and on the way out of it.** `createUser` writes `normalizeEmail(email)` and `findUserByEmail` looks up `normalizeEmail(email)`, so two spellings of one address are one account whether they arrive through the surface or straight at the store, and a row is always stored in the form the sign-in looks it up by. That is the store's identity model rather than a preference: the lookup is an exact match against a value in a column, so a row stored as `Ada@Example.test` is not found by a sign-in that looks up `ada@example.test`, and folding only the comparison would refuse the duplicate and then write an account nothing can sign in to.

**The limit, because it is a decision and not a setting.** Two spellings your own collation would treat as different addresses are one account here. A host that disagrees writes its own `CredentialStore`, whose `findUserByEmail` and `createUser` use its own comparison, and says so in those two methods. There is no option to make this one case-sensitive, and adding one would produce a store that sometimes writes rows its own sign-in cannot find.

**`createUserIfAbsent` is the one store method that is safe under concurrency, and it is the one that needs a database.** `createUser` refuses a duplicate it can see, and its docstring says plainly that a read followed by a write is a shape two callers interleave. Eight concurrent direct `createUser` calls for one address wrote eight rows on both shipped adapters before this existed, and they still would: the check inside it is a check, not a constraint.

```ts
const account = await store.createUserIfAbsent({ email, passwordHash });
// null means an account for that address was already there. One statement, so the database decides.
```

`AdminPersistenceAdapter` gained the optional `insertIfAbsent(resource, key, value)` to carry it, because the database is the only thing in a process that can make the decision atomic. It is optional and **its absence is the answer**: a store whose persistence cannot do it does not offer `createUserIfAbsent` either, rather than offering a method that cannot keep the promise in its name. `create` uses the primitive when it is there and the per-address queue when it is not, both rather than either, so a host supplying neither still gets the in-process guarantee.

What each adapter does, because they are honest in different ways:

- **The SQLite adapter** creates a unique index on first use and inserts with `ON CONFLICT DO NOTHING`. The index is partial: `WHERE resource = 'users'` over `json_extract(data, '$.email')`, so it is invisible to every other resource in that shared table, since SQLite treats a NULL in a unique index as distinct from every other NULL. **The index outlives the call that made it**, so after one use the database refuses a duplicate address for that resource on every write, `create` included. That is a constraint appearing in a table you did not write, and it fails loudly and permanently if the table already held duplicates, with a message naming the resource and key.
- **The memory adapter** has no `await` between its test and its push, and JavaScript runs one thing at a time, so the body cannot be interleaved. That is the whole guarantee and it is a property of that function's source rather than of a mechanism, so an `await` added between the two lines would silently turn it into the racy check-then-write it is not. There is a test that hammers it concurrently because nothing else would notice.

**The cross-process half, for a host with a real schema, is a unique index on the column.** `CREDENTIAL_USERS_SCHEMA` declares one; neither shipped adapter runs that DDL, because they keep the address as a value inside a document rather than as a column. A host on its own mapped schema implements `insertIfAbsent` as `INSERT ... ON CONFLICT (email) DO NOTHING` and gets it from the column.

Four store methods are optional: `listUsers`, `createUser`, `updateUser` and `listSessions`. A store written before them is a working sign-in, and a surface that reported an empty account list would be the one answer that cannot be told apart from an admin with nobody in it, so it names the method to add instead.

**Hand-rolled instead:** six methods on your own `CredentialStore` and pass it to `createAccountAdmin`, or skip it and build the actions yourself. Nothing requires it, and the schema does not gain a table.

### The secret

`createSessionAuthAdapter` refuses a secret shorter than sixteen characters, and `generateSessionSecret()` mints one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Put the value in the environment, not the repository. A constant in a package is a constant in every host that forgets to configure one, and those hosts would all share it. A per-process random is the other wrong answer: a deployed app answers the next request from a different instance, every signature fails, and every visitor reads as signed out.

### The store is the seam

What a host supplies is a store: six methods and two plain records.

```ts
type CredentialStore = {
  findUserByEmail(email: string): Promise<CredentialUser | null>;
  findUserById(id: string): Promise<CredentialUser | null>;
  createSession(userId: string, expiresAt: number): Promise<CredentialSession>;
  readSession(id: string): Promise<CredentialSession | null>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<number>;
};
```

A host already on `AdminPersistenceAdapter` gets this over the memory and SQLite adapters for nothing, and the table and column names are options because those belong to the host rather than to the demo:

```ts
const store = createPersistenceCredentialStore(persistence, {
  users: "accounts",
  sessions: "logins",
  userColumns: { email: "login", passwordHash: "pw", role: "kind" },
  sessionColumns: { userId: "account_id", expiresAt: "valid_until" },
});
```

A host with a schema of its own, or one on something `AdminPersistenceAdapter` does not describe, writes the six methods. The alternative was to take a table name and build SQL here, which would work for exactly the hosts already on `AdminPersistenceAdapter` and would put this package's idea of a schema in front of everyone else.

The role a session acts as is read from the user row the session points at, so it is a stored value rather than something a request can name. Nothing in the cookie carries a role, which is what keeps a signed cookie from being a claim: it names a session, the session names a user, and the user decides.

### The schema it expects

`CREDENTIAL_USERS_SCHEMA` and `CREDENTIAL_SESSIONS_SCHEMA` are the two tables, as SQL to run once. Constraints live in the database rather than only in the adapter, because an adapter can be bypassed by a hand-edited request and a constraint the database does not enforce is a comment.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
```

The role list in the users schema is a starting point for a host with no accounts yet. A host that already has one keeps it and points the store at its own columns.

### Password recovery

`AdminLoginScreen` collects credentials and reports what came back. What happens to an address someone cannot sign in with is the host's, and so is the whole of it: identity verification, rate limiting, the token, the channel, and the new password. The demo's half takes its transport from the host rather than owning one, so the two functions that matter are yours:

```ts
const recovery = createDemoRecovery({
  transport: {
    issueToken: ({ email, expiresAt }) => myTokens.issue({ for: email, expiresAt }),
    send: ({ email, token }) => myMailer.sendResetLink({ to: email, token }),
  },
});
```

With no `transport` the demo refuses and says it is not configured, rather than answering as though a link were on its way. It ships in that state. Its accounts are seeded, its password is printed on the login page, and there is nothing for a visitor to have forgotten, so a link this process could not deliver would be a credential with nothing to do except be replayed. Point `HELMDECK_RECOVERY_WEBHOOK` at an endpoint you operate to turn it on, and recovery posts `{ email, token, expiresAt }` to that endpoint and keeps nothing.

**A request answers the same either way.** An address with no account is given the confirmation an address with one gets, down to the cost of the hash behind it. A reset form that reports "no such address" is the enumeration oracle a login form would have had, under a new name.

What is written down while a link is outstanding is a scrypt digest of the token under a salt minted per request, so a copy of the store is a list of accounts that have asked rather than a list of links that work. A record is spent on use, dropped when it is read after it lapsed, and replaced when the same account asks again, so the newest request is the only one that works.

`redeem()` returns the account a token was worth and stops there. Updating that account's password belongs to whoever owns the accounts, and in the fixture the accounts are shared, so the published password is what they keep.

**Hand-rolled instead:** skip the adapter and call your own handler from a server action. Nothing here is required by the sign-in screen, and existing sign-in behavior is unchanged when no recovery is configured.

### Permissions and resources

`AdminPermissionsProvider` resolves and remembers answers. `useAdminPermission(permission)` reports one permission's state, `useAdminCan` is the boolean form, `AdminCan` renders its children only when a permission is held, and `useAdminPermittedNav` filters nav items that carry one.

Everything **fails closed**: no adapter denies, an adapter that rejects denies, and a guard used with no provider denies rather than throwing. A missing adapter must never read as permission granted. Each of those cases also warns in development, so the failure is diagnosable without weakening the control. A failed check is not cached, so one outage does not become a denial that outlives it.

A nav item with no `permission` is always kept, so adopting this costs nothing until you opt an item in. A gated nav renders **empty** until its permissions are answered, because rendering the unfiltered nav and hiding items afterwards would put links to unreachable pages into the tab order.

```tsx
const posts = defineAdminResource({
  resource: "posts",
  label: "Posts",
  columns: [{ key: "title", header: "Title" }],
  fields: [{ name: "title", label: "Title", required: true }],
  permissions: { read: "posts.read", create: "posts.create", update: "posts.update", delete: "posts.delete" },
});
```

`AdminResourceList` and `AdminResourceForm` generate the list and detail views from that, with each control wrapped in the resource's own permissions. `adminResourceValues` reads only the declared fields, so a field removed from the definition cannot be smuggled back in through a hand-edited request. The definition is a plain description: nothing in it reads or writes, so it can also be used as route-generation input. It is also a value a server component can hand to a client view, with the exceptions named where a column's formatting is described.

#### Searching, sorting, filtering and paging a generated list

A list is a window onto a collection, so the collection's size is part of what the list has to say. An adapter answers that with `queryPage`, beside the rows-only `query`:

```ts
type AdminPersistenceAdapter = {
  query: <T>(resource: string, query?: Record<string, unknown>) => Promise<T[]>;
  queryPage?: <T>(resource: string, query?: AdminResourceQuery) => Promise<AdminResourcePage<T>>;
  // read, create, update, delete as before
};
```

```ts
import type { AdminResourcePage, AdminResourceQuery } from "@yesvus/helmdeck";

const db = {
  // ...the rest of the adapter
  async queryPage<T>(resource: string, query: AdminResourceQuery = {}): Promise<AdminResourcePage<T>> {
    // The count is what the query matched before the window, so a list can say "showing 40 of 4000".
    const total = await db.count(resource, query);
    const rows = await db.select(resource, query);
    return { rows, total };
  },
};
```

`AdminResourceQuery` is the whole of what a list can ask for, and every part of it is optional:

| Part | Shape | What it asks for |
| --- | --- | --- |
| `search` | `string` | a term, matched by the store rather than by the view |
| `filter` | `{ field, operator, value }[]` | comparisons, with `operator` one of `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `isNull`, `notNull` |
| `sort` | `{ field, direction: "asc" \| "desc" }[]` | the ordering, first entry first |
| `window` | `{ offset, limit }` | which slice of the matched set to return |

`AdminResourcePage<T>` is `{ rows: T[]; total: number }`, with `total` required: an adapter that implements this has committed to counting, and the number it reports is the one the list shows.

**The host answers the query. The view never does.** A generated list filters nothing, orders nothing and slices nothing it was handed, so the count beside the table is the count the store gave rather than the number of rows that happened to render. That is also why an adapter that answers with rows the query does not match will see them on screen: the list reports what it was told.

**An adapter without `queryPage` keeps working, and is not asked.** `query` is unchanged, so an adapter written before this contract still satisfies `AdminPersistenceAdapter` and a list reading through one renders every row it was given, exactly as before. A generated list draws no search box, no sort control, no filter bar, no pagination and no count for such an adapter, because a control that cannot work is not drawn, and a count nobody answered is not a count. The declaration is what turns the features on:

```tsx
const posts = defineAdminResource({
  resource: "posts",
  label: "Posts",
  columns: [
    { key: "title", header: "Title", sortable: true },
    { key: "status", header: "Status" },
  ],
  fields: [{ name: "title", label: "Title", required: true }],
  filters: [
    // Options make it a choice from a set; without them it is a term compared with "contains".
    { field: "status", label: "Status", options: [{ value: "live", label: "Live" }] },
    { field: "views", label: "At least", operator: "gte", parse: (value) => Number(value) || undefined },
  ],
  permissions: { read: "posts.read" },
});

<AdminResourceList definition={posts} persistence={db} pageSize={40} />;
```

- `sortable: true` on a column puts a sort button in its header, which cycles ascending, descending and back to the store's own order.
- `filters` are the controls the list draws. A field the definition does not declare has no control, and a control whose value `parse` answers with `undefined` sends no comparison.
- `pageSize` is how many rows a window asks for, 40 by default.
- The count, the search box, the sort directions, the filter label and the "no records match" copy are the `labels` prop, so a host translates one object. Pagination keeps its own labels, which live in the message dictionary.

#### Printing a column's value

A column's `format` **names** a formatter rather than being one. `"money"` and `"count"` are the two the package prints, the first reading the stored integer as whole cents, and the division by a hundred happens at the moment of display and nowhere earlier. Any other name is the host's, written `{ name: "..." }`, and the list resolves it from its `formatters` prop:

```tsx
const posts = defineAdminResource({
  resource: "posts",
  label: "Posts",
  columns: [
    { key: "title", header: "Title" },
    { key: "price_cents", header: "Price", align: "right", format: "money" },
    { key: "status", header: "Status", format: { name: "status" } },
  ],
  fields: [{ name: "title", label: "Title", required: true }],
});

<AdminResourceList
  definition={posts}
  persistence={db}
  formatters={{ status: (value) => <StatusPill value={String(value)} /> }}
/>;
```

A name nothing answers is refused while the table is built, naming the column and the name it wanted, rather than falling back to the stored value. A column silently printing `4900` where its own definition promised `$49.00` is a wrong number on a page that looks right.

#### A column that names a row of another resource

`reference` is what a foreign key is in a definition: a `resource` to point at, and optionally the `field` of the target a person should read instead of its id. Both are names, so a definition carrying one still crosses the client boundary from a server component.

```tsx
const shipments = defineAdminResource({
  resource: "shipments",
  label: "Shipments",
  columns: [
    { key: "tracking", header: "Tracking" },
    // Prints the customer's name, not the id in the column.
    { key: "customer_id", header: "Customer", reference: { resource: "customers", label: "name" } },
  ],
  fields: [
    { name: "tracking", label: "Tracking", required: true },
    // A select over the customers that exist, and a write checked against them.
    { name: "customer_id", label: "Customer", required: true, reference: { resource: "customers", label: "name" } },
  ],
  permissions: { read: "shipments.read", create: "shipments.create" },
});

<AdminResourceList definition={shipments} persistence={db} />;
```

A `resource` on its own is the whole of what is required, and it is the minimum that lets the server refuse a value naming a row that is not there. `label` is for the targets whose id is not what a person would say out loud, and a target row whose `label` is empty prints its id rather than a blank. The value is the target row's own id, which is the one name a row is read by everywhere a reference is resolved. A column holding a slug is a column a reference cannot point at, and a host with one writes a `format` for the cell and a `render` for the field.

**Both halves ask the store the same question.** A field's choices and a list's filter over that field are the same call, at the same window, through the same adapter, so a reference cannot come to mean one thing in a form and another in a list. Neither is drawn from a constant:

- The form's control is a `select` over the rows the store answered, asked as a windowed query. `referenceLimit` sets the window (100 by default) and the count the store reported past it is said out loud, because a control offering 100 of 108 without saying so is making a claim it cannot back.
- A list draws a filter for every reference the definition declares no filter of its own for, and sends it as `eq` on the field to the adapter like any other comparison. Narrowing a list is the store's work.
- A list prints the row a column names, resolving one hop per value on the page.

**A write naming a row the store does not hold is refused.** `createAdminResourceActions` takes `definitions`, reads them for the references they declare and nothing else, and refuses before the store is reached:

```ts
export const actions = createAdminResourceActions({
  guard: requirePermission,
  persistence: db,
  expose: exposedResource,
  definitions: [products, orders, shipments],
});
```

`AdminResourceReferenceError` names the field and the value, so the author of the write learns which reference was wrong. The check is a read of the target rather than a membership test over the choices a control was drawn from, which is what lets a reference pointing past the window of options still be a real reference.

**A write is checked for what it introduces.** A value the record already holds is not checked again on an update. It was put there by an earlier write, so the author of this one is asserting nothing about a resource they may not be allowed to read, and checking it would make a record holding such a value uneditable by the people who are allowed to edit it: the tracking number cannot be corrected because a column nobody can see is on the same row. The form already draws the other half of that bargain, offering the value a control cannot fetch as its own option rather than dropping it, so the two halves of a reference have to agree about it or a form draws a save the server refuses.

The cost is one read of the record being written, and only on an update that names a reference at all: a resource declaring none, or a write naming none, reads nothing it did not read before. A record that cannot be read leaves nothing to compare against, so its values are checked as a create's are, and a create has no stored record to compare against, so every value it carries is checked.

**A reference to a resource the session may not read is refused, not offered.** Because a value is checked by reading the row it names, the target's read goes through the same guard as any other: no choices are offered for a field or a filter the session may not follow, and a write **changing** a value to one is refused **identically whether or not the row is there**. That is the property, and an error that differed between a real id and an invented one would be an oracle for which rows of another resource exist. The demo's `shipments.order_id` is exactly this: administrators can read orders, editors cannot, so an editor is offered no orders, cannot attach one, and can still edit a shipment an administrator attached one to.

**One hop, so a cycle terminates.** `customers.parent_id` naming a `customers` row is a real shape, and resolving it never asks what the target's own values name. A cell needs the label of the row it points at and nothing else, so a page of rows in a cycle resolves each value once and stops. A host that wants a path rather than a name writes a `format`, which is where code goes.

**What a dangling value does.** A value naming a row the store does not hold is refused on the way in, which is the only answer that keeps the stored data true. One that got in around the form, through a raw adapter write, or by the row it named being deleted afterwards, is drawn as a marker rather than as an id a reader would take for a name. The two are different claims and a column of blank cells would claim the second. An edit that leaves such a value alone is allowed and leaves it in place: the write did not make it true and cannot make it false, and the cell keeps saying so.

**A definition with no reference behaves exactly as it did.** No extra reads, no extra controls, and `adminResourceValues` reads its fields the way it always did. A field's reference with nothing chosen for it stores `null` rather than an empty string, because a database holding a foreign key column reads the empty string as a reference to a row whose id is the empty string: a reference to nothing while looking like a value.

Declarations that could be drawn two ways are refused at `defineAdminResource`: a field with both a `render` and a reference, a column with both a `format` and one, a column and a field of the same name pointing at different rows, a filter that writes its own options beside a reference, a name the reference does not carry, and a resource name that is not a name. `defineAdminResource` is where a typo in a declaration is found; a blank cell tells its author nothing about where the name came from.

**Most of a definition crosses the client boundary; the rest is code and does not.** `AdminResourceList` and `AdminResourceForm` are client components, so a definition passed to one from a server component travels as data. A column's `format` is a name for that reason. A field's `render` and `parse` and a filter's `parse` are functions and cannot be serialised at all, so a definition declaring one has to be built on the side that renders the view, and its page has to be a client component. Nothing about that is a limitation of the framework's convenience: a custom control and a custom comparison are code, and code has to be on the side that runs it.

**A query that crosses the server is read or refused.** `createAdminResourceActions` reads the query it is handed before it asks about the session, and refuses anything it cannot read: a part that is not part of a query, a field name that is not a field, an ordering that is not ascending or descending, a comparison with nothing to compare to, an offset that is not a whole record, a window of no rows, and a window larger than the contract allows. The refusal is deliberate, because the adapters this contract grew out of read every key they are given as a field to match exactly: a `sort` was a column named `sort`, and a `limit` was a filter nothing matched. A store is not handed a guess about what a caller meant.

`query` on the actions is still the rows-only read, and its argument is passed through as the host's adapter takes it. A host that wants its queries read, checked and counted asks for `queryPage`, and a host whose adapter has no `queryPage` is not offered one, so a list mounted on the actions sees the same capabilities it would see mounted on the adapter itself.

### Getting a list out of the store, and a file back into it

An export is a dump of a table or it is the list a person is looking at, and the two are different files. A CSV of every row answers a question nobody asked; a CSV of the filtered, searched and ordered set answers the one in front of them. This package treats the second as the only export there is, which is only possible because the query the list is holding is a value the store can be asked and can count.

`adminResourceExport` is the file, and `adminResourceExportResponse` is the same file as the response a route hands back:

```ts
// app/admin/products/export/route.ts
import { adminResourceExportResponse } from "@yesvus/helmdeck";

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return adminResourceExportResponse({
    actions: store,
    resource: "products",
    filename: "products.csv",
    columns: [
      { key: "name", header: "Name" },
      { key: "sku", header: "SKU" },
      { key: "price_cents", header: "Price", format: "money" },
    ],
    query,
  });
}
```

**It reads through the actions, not around them.** The query arrives from the browser, is read by the same parser a read is refused by, and reaches the store through the same `queryPage` the list view uses, so the rule, the exposed set and the store's own row scoping all apply to a file exactly as they apply to a table. An export that reached `persistence` directly would hand a session that may read forty rows a file of the whole table, and the rule would be consulted once at the top of a route rather than per page. The refusal is the refusal: a session the rule withholds gets `AdminPermissionDeniedError` before the first window is read, and `AdminResourceExportError` comes back for a store with no paged query, which cannot say how many rows a query matched and would therefore be exporting however many rows it felt like returning. The first window is read before the call resolves, so a refused export, a query the store could not be asked, and a set larger than `ADMIN_RESOURCE_EXPORT_MAX_ROWS` are all refusals rather than a body that fails once it is piped. The cap is a refusal and not a truncation: a file holding the first fifty thousand rows of a hundred thousand is a file that claims to be the list and is not.

**The count is the store's, and the file is walked rather than collected.** `total` is what the store counted for the query before any window, and the walk stops there. The bytes come back one row at a time, so a fifty thousand row export is never held whole in memory by this package, and `adminResourceExportResponse` streams them into the response rather than building it. The generator's own return value is `{ exported, complete }`, which is how a caller writing to a file learns that the walk ended early: a store that stopped answering windows produces a real file of the rows that came, and `complete: false` is the claim that it is not the whole set, which nothing downstream can work out from the bytes alone. Give the query an ordering if your store does not settle ties itself, since this walks the matched set in windows and a store that ranks two queries for one set differently is a store where a row can be read twice and another not at all.

**A window in the query is dropped.** An export is the whole of what a query names rather than the page the reader happens to be on. `file.query` is the query as this package read it, so the caller can see what was asked for.

**The columns are declared rather than read off a definition.** A definition's header is a node, which a file cannot hold, so a host says the text; and a column naming another row's field is a column whose value is that row's label rather than its id, which is a read of the target resource per page. Declaring the columns puts both of those choices where they can be made and leaves nothing to be read correctly by accident. `format` answers `money` and `count` as the list does, and anything else through `formatters`; a name nothing answers is refused before the store is asked, because a column silently showing `4900` where its definition promised `$49.00` is a wrong number in a file that looks right. A value the row does not hold is an empty cell whatever the format says, because a dash in a numeric column is a column nobody can sum.

**A cell a spreadsheet would run is marked, not written.** A customer's name of `=HYPERLINK("http://evil","Statement")` written honestly is a file that runs on the finance team's machine the moment somebody clicks the column, and "we wrote valid CSV" is not an answer to that. A cell whose text begins with `=`, `+`, `-` or `@` is written with a leading apostrophe, which every reader treats as text, and a value that is nothing but a number is left as the number it is: a cell with no operator and no function name in it has nothing to run, so a column of refunds stays a column a spreadsheet can sum. A value beginning with an apostrophe is marked the same way, and that is not redundancy: it is what tells the two apart on the way back in, so `'=1+1` comes back as `'=1+1` and `=1+1` as `=1+1`. `adminCsvCell` and `adminCsvText` are that pair, exported because a host writing CSV by hand should not have to decide the escaping on its own.

**A null is an empty cell, and so is an empty string.** A file cannot say which of the two a blank cell is, so the export writes both as nothing and the import reads both back as `null`. Every other value is text, because CSV has no types: a column that wants a number says so with a `parse`, since `007` is a product code to one store and seven to another. Records end with CRLF and a value's own newline stays inside its quoted cell.

**An import is the same importer for the first row and for the ten thousandth.** `adminResourceImport` reads a file as records, writes one row, and reports that row's outcome before it has read the next one, so a thousand rows and one row go through identical code and make identical decisions. `adminResourceImportResult` is that same stream read to the end:

```ts
// app/admin/products/import/route.ts
import { adminResourceImportResult } from "@yesvus/helmdeck";

export async function POST(request: Request) {
  return Response.json(
    await adminResourceImportResult({
      actions: store,
      resource: "products",
      columns: [
        { header: "Name", name: "name" },
        { header: "Price", name: "price_cents", parse: (text) => (text === null ? null : cents(text)) },
      ],
      rows: request.body,
    }),
  );
}
```

`rows` takes a `ReadableStream`, an async iterable, a plain iterable of pieces, or one string, and a file split a character at a time reads the same as a file handed over whole, so a route does not have to make an upload be a string before it can be read. A byte-order mark at the front of the file is dropped, because a spreadsheet writes one to say the file is not Latin-1 and it belongs to the first column's name rather than to the file.

**A row that cannot be written does not undo the rows that were.** They are in the store, and the report says which line failed and what it said. That is not a shortcut around a transaction, it is the only answer a streaming read can give: all or nothing means reading the whole file before writing the first row, which is the batch this is built not to be, and a ten thousand row import rolled back over one bad line is a person doing the work twice. A host that needs one row or the whole file owns the transaction in its own store, where one belongs. `stopOnError` is the middle setting, for a caller that would rather have a short file and a re-run, and the result says which of the two it was.

**Every row is a create through the same actions.** The rule, the exposed set, the references a write may not name, the audit trail and the cache are the ones a person typing the same row into a form would get, so an import cannot create what a form could not. The rule is asked once per row, because the alternative is a decision made once for a file nobody has read yet. A row the file cannot be read as at all is reported as malformed and never written, and the reader picks up at the next line break rather than refusing the file: one stray quote among ten thousand good rows is one row a person can fix, and a row is the unit this loses.

**The header is refused rather than repaired,** before a single row is written: a file with two columns of one name has rows whose cells cannot be told apart, and one with a column of no name has a value with nowhere to go. So is an empty file, and so is a row with more cells than the header names. `adminCsvRecords` is the reader on its own, for a host that wants the records rather than the writes, and `adminCsvCellValue` is what a cell of a file being read carries.

The two halves have the same shape: a primitive that streams, and a thin wrapper for the case where a route wants the whole answer. The export's wrapper is the `Response` above. The import's is `adminResourceImportResult`, which drives the same stream and returns the counts a JSON response needs, with the failure list capped at `ADMIN_RESOURCE_IMPORT_MAX_FAILURES` and the count of the ones the cap left out beside it, so a report of twenty entries is never read as the whole of what went wrong. There is no equivalent for the export, because the only way to know a file's finished count without a walk is to have done the walk, and a `string` return would be that walk held in memory.

**Hand-rolled instead:** read the rows yourself and write the file. The bytes are the easy half. What is not the host's to redo is the rule being asked before the first row, the store's count being the one in the file, the escaping being the same in both directions, and a value beginning with `=` not becoming something a spreadsheet runs on the machine of whoever opens the file.

### Enforcing a permission on the server

Everything above runs in a browser, so it decides what is drawn. This section is the half that refuses. A hidden button is not authorization: any client can post the action directly, and the button is not in the way.

Write one rule and let the package ask it on both sides.

```ts
// lib/rules.ts, asked by the views and by the actions
export function can(session: AdminSession, permission: AdminPermission) {
  const [resource, operation] = permission.split(".");
  if (!EXPOSED.has(resource)) return false;
  return OPERATIONS.get(session.role ?? "")?.has(operation) ?? false;
}
```

```ts
// lib/permissions.ts, no directive: both ends that ask the rule
export const check = createAdminPermissionCheck({ rule: can, session: currentSession });
export const requirePermission = createAdminPermissionGuard({
  rule: can,
  session: currentSession,
  onUnauthenticated: () => redirect("/admin/login?next=/admin/billing"),
  onDenied: ({ permission }) => forbidden(`This session may not ${permission}`),
});

// app/lib/permission-actions.ts
"use server";
export const checkPermission = async (permission: AdminPermission) => check(permission);
```

A `"use server"` file exports async functions, so a factory's result is handed to one. That wrapper is the whole of the bridge, and the client adapter is `can: checkPermission`.

`check` is what the views ask, so the client half has no verdict of its own to hold. The browser sends a permission name and the record it is about; the rule is handed the session the server resolved from the cookie and the row behind it.

`requirePermission` returns the session or throws, and a handler that returns instead of throwing still gets the refusal, so a redirect or a 403 is the host's to choose and the effect is unreachable either way. Call it once at the top of a route, a page, or an action rather than repeating the check in every page.

`createAdminResourceActions` puts the same guard in front of a store, for the resource surface:

```ts
// lib/resource-store.ts
export const store = createAdminResourceActions({ guard: requirePermission, persistence });

// app/lib/resource-actions.ts
"use server";
export const queryResource = async (resource: string) => store.query(resource);
export const readResource = async (resource: string, id: string) => store.read(resource, id);
export const createResource = async (resource: string, value: unknown) => store.create(resource, value);
export const updateResource = async (resource: string, id: string, value: unknown) => store.update(resource, id, value);
export const deleteResource = async (resource: string, id: string) => store.delete(resource, id);
```

`AdminResourceList` and `AdminResourceForm` take an object of those as their `persistence` prop, so the reads a list performs are the ones that were refused, and a delete reaches the store only after the rule allows it. A resource name arrives from the browser as a string the caller chose, so `expose` is a closed set of names and is checked before the session is resolved. `before` runs after the refusal and before the effect, for a store that has to be prepared first. Passing no guard throws at construction rather than handing back calls that decide nothing. The set carries a sixth call, `queryPage`, when the host's adapter has one, and omits it when it does not.

### Recording the writes and dropping the caches

`AdminAuditAdapter` and `AdminCacheInvalidationAdapter` are two more options on the same call, so a host hands them where it already hands the guard:

```ts
import { createAuditAdapter, createCacheAdapter } from "@yesvus/helmdeck/baseline";

export const store = createAdminResourceActions({
  guard: requirePermission,
  persistence,
  expose: exposedResource,
  audit: createAuditAdapter({ sink: (event) => log.write(event), onError: report }),
  cache: createCacheAdapter({ invalidate: (keys) => Promise.all(keys.map(dropKey)) }),
});
```

Both are optional and independent. A host that wires neither gets exactly the behaviour it had before, and a host that wires one is never asked about the other.

**A write is recorded after it happened, not before.** The seam makes that decision, and it is not symmetric:

- An event written first and left behind when the write failed claims a change that did not happen, and nothing in the event tells a reader to doubt it. That is the dishonest direction, and it is the one this seam cannot produce.
- The price of that choice is a process that dies between the write and the record, which leaves a change nobody wrote down. Closing that window is a transactional outbox in your own store, in the same transaction as the write, which is a schema question rather than a seam one. A host that needs it wraps `persistence` rather than these calls.

A refused call records nothing, because nothing happened to record: a permission the rule withheld, a name outside the exposed set, a store that refused the write, and a reference value naming a row the store does not hold all leave the trail as it was. A read records nothing either. If you want refused attempts in your trail, `onDenied` on the guard already holds the permission and the record, and that is where they belong.

**The event says what happened.** `action` is the operation (`create`, `update`, `delete`), `resource` and `resourceId` name the record, `actor` is the session the guard decided for, and `occurredAt` is an ISO timestamp. A create names the id **the store assigned**, which is the other reason the event is built after the write: before it, a create has no record to name, and a trail that cannot name a new record is not the history of anything. `metadata.fields` holds the field names of the record the store now holds, which is the shape of the write and not a diff. Names rather than values on purpose: a trail holding every value a record ever had is a second copy of every secret in the table. A host that wants the values keeps them where a change is reversible from, which is its own revision store.

Reading the trail is the host's sink: the events carry the resource and the record, so the history of one record is a query against your own table. A diff, a restore, and a shipped place to read a trail are not part of this contract.

**A create invalidates the resource, not the record.** A record no read has returned yet has no key in your cache, so what a create invalidates is the collection it joined. An update and a delete name the record, because that is the key a read of it cached.

**A rejected adapter does not fail the write.** The change has already happened by the time either runs, so raising would report an error on a save that worked, which is how a person stops trusting the thing they were protecting. `onAdapterError(cause, { adapter, operation, resource, resourceId })` is where the failure goes: swallowed failures are invisible failures, and a host whose trail stopped being written is a host that cannot tell. One half failing does not stop the other, so a broken log still lets a stale read be dropped. `createAuditAdapter` and `createCacheAdapter` take their own `onError` and swallow before this seam ever sees the rejection, which is why the shipped defaults need nothing further.

**Hand-rolled instead:** call `audit.record` and `cache.invalidate` from your own write boundary. This package cannot record an intent whose outcome it does not know, and a host that wants one transaction around both the write and the record has to own the transaction.

**A decision carries the record the call names, and the view asks it the same way.** `read`, `update` and `delete` are decided for the record they are given, so a rule that withholds one record refuses that record and nothing else. `query` and `queryPage` name no record, so they ask the collection question the list asks. Two halves asking different questions get different answers from a per-record rule, which is a button that renders and then fails, or one that does not render and succeeds anyway.

Which rows a read returns is your own row scoping, alongside whatever else filters it. A rule asked once per returned row would be a second row filter in a place that cannot compose with the first, so a host with per-record read rules narrows inside the query it hands to `persistence`, and every record a `read` or a `write` names is enforced at the boundary.

**A missing rule denies.** A host that wired the views and not the server has no authorization at all, so a permission decision denies rather than allows, and the view hides what it would have shown. The view's answer is the server's either way, so hiding is not what makes it safe; it is what makes it diagnosable. A view showing everything looks exactly like a host whose roles grant nothing, and sends the person debugging it to the role rules instead of to the rule that is not there. The refusal also warns in development. The errors are `AdminUnauthenticatedError`, `AdminPermissionDeniedError`, which carries the `reason` for the refusal, and `AdminResourceNotExposedError` for a name outside the exposed set.

`evaluateAdminPermission` is the decision on its own, for a host whose check is not built from a resolver.

**Hand-rolled instead:** call your own function from your own route handler and your own server action. The point of this section is one rule asked twice rather than two rules, not the package's code.

**Your write boundary must do the same, and the views are not what does it.** `adminResourceValues` is what the generated forms call, in the browser. A hand-edited request does not go through a form, so a server action that hands its argument straight to the adapter stores whatever it was sent. The demo's actions run the incoming value through `adminResourceValues` on the server before the write, which is what makes the claim true of the boundary rather than only of the form:

```ts
function declaredValue(resource: string, value: unknown): Record<string, unknown> {
  const definition = adminResources.find((candidate) => candidate.resource === resource);
  if (!definition) throw new Error(`No resource definition named ${resource}`);
  const incoming = (value ?? {}) as Record<string, unknown>;
  const form = new FormData();
  for (const [key, entry] of Object.entries(incoming)) {
    form.append(key, entry === null || entry === undefined ? "" : String(entry));
  }
  return adminResourceValues(definition, form);
}

export async function createResourceAction(resource: string, value: unknown): Promise<unknown> {
  await requirePermission(resource, "create");
  return adapter.create(resource, declaredValue(resource, value));
}
```

That also means the server names the record: `id` is a field only if the definition declares it, so a caller cannot choose one and write over a row that already exists. The persistence layer's column check is not a substitute. It asks whether a name is a column of the table, and `id`, `created_at` and `updated_at` all are.

**Hand-rolled instead:** implement `AdminPermissionsAdapter` and `AdminPersistenceAdapter` yourself. Nothing in the views requires the memory adapter; it is one implementation for fixtures and tests.

### The memory adapter

`createMemoryPersistenceAdapter` is CRUD over plain objects, which is enough for a fixture or a test with no database. It hands out copies in both directions, so a caller cannot edit stored state without going through `update`. It answers `queryPage` too, ranking and comparing stored values the way SQLite does, so the same records answer the same query the same way through either store. Matching a database means matching its spelling as well as its order, so a number reads as fifteen significant digits, a search folds the ASCII letters and no others, and text orders by code point rather than by the surrogate pairs a JavaScript string compares on. `createAuditAdapter` and `createCacheAdapter` are thin defaults that swallow their own failures, because the change has already happened by the time either runs; both take an `onError` so the failure is still observable.

### The SQLite adapter

`createSqlitePersistenceAdapter` is the same CRUD over a real database, with no schema to design first. Point it at a path and it creates the table it stores in on the first call.

```ts
import { createSqlitePersistenceAdapter } from "@yesvus/helmdeck/baseline";

export const persistence = createSqlitePersistenceAdapter({ url: "file:./helmdeck.db" });
```

A path with no scheme is a local file, so `file:./helmdeck.db` and `./helmdeck.db` are the same store. The same adapter takes `libsql://` with an `authToken` for a hosted database, so the local file grows into hosted storage by changing a string rather than by changing code.

Records are stored as JSON documents keyed by resource and id, which is why no schema is needed: any resource works on the first call, and an id you supply is the id that is stored, so seeded rows keep pointing at each other.

Filters are exact matches on a stored value, so a filter is a string, a number, a boolean or `null`. Each predicate states the JSON type it expects, which is what keeps a filter for `1` from being answered by a record storing `true`, and lets `null` find a record storing `null` rather than matching nothing at all. A filter carrying an object or an array is refused with an error rather than compared as text, because text comparison matches on key order and would quietly return the wrong rows.

It answers `queryPage` as well, so a list reading through it draws its search box, sort controls, filters, pager and count, and every one of them reaches the database. The count is a statement of its own rather than a length of the rows it sent, because a window that has run past the last matching record comes back with no rows at all, and a list holding nothing has to ask whether that is an empty resource or an offset beyond the end of one. `ORDER BY` settles ties on `id`, so paging through an ordering that leaves rows equal cannot repeat one and drop another. With no ordering asked for, the rows come back in the table's own insertion order, which is what the in-memory adapter returns and what makes a window over no ordering repeatable.

A comparison ranks before it compares, and so does an ordering, and both rank by the same written rule: nothing first, then numbers and booleans, then text. That is the database's own order of storage classes, and the adapter states it rather than leaving it to the engine, so a comparison and an ordering are the same rule read twice rather than two that happen to agree. A text value is above a number however the two would compare as text, and a boolean is the number a database stores it as, so `true` and `1` order as each other. A value the record does not have ranks with the nulls rather than above them, and reading an ordering the other way reverses each class and puts the nulls at the end. **A null is the lowest class, and a range filter can be given one**, so `gt(null)` is every record that is not null or absent, `gte(null)` is every record, `lt(null)` is none, and `lte(null)` is the null and the absent. That is where a three-valued language and a two-valued one part company: there is no value to compare and nothing compares against nothing, so the class decides and the operator still says which way. Both shipped adapters rank the same way, which is what lets a fixture and a database answer the same question alike.

This is the adapter to start on. A filter runs through `json_extract`, which SQLite cannot index the way it can a column, so once a resource is large enough that the scan shows, put it behind a mapped schema and the same `AdminPersistenceAdapter`.

## Host integration contracts

`AdminAuthAdapter` resolves the current session and handles login/logout. `AdminPermissionsAdapter` answers host-defined permission checks; shell navigation role filtering is presentation only and never replaces route or operation authorization. The host owns identity, session lifetime, credentials, permission names, and the rule itself; the package supplies the two ends that ask it.

`AdminPersistenceAdapter` is a generic boundary for host data reads and writes. Resource names, data types, validation schemas, transactions, and domain rules remain host-owned. `AdminMediaAdapter` owns media listing, upload, and media mutations; storage, URL signing, and retention remain host responsibilities.

`AdminLocaleAdapter` distinguishes interface locale from content locale. Interface dictionaries are provided by Helmdeck, while the host chooses locale policy and owns translations and localized content. Optional content-locale selection persists through the host callback.

`AdminAuditAdapter` accepts the events a resource write leaves behind, and `AdminCacheInvalidationAdapter` receives the same writes so the host can invalidate its own caches. These two are not free-standing: `createAdminResourceActions` calls them, after the store has answered, and only for the calls that were allowed to reach it. [Recording the writes and dropping the caches](#recording-the-writes-and-dropping-the-caches) is the whole of what they are told and when. `AdminPreviewAdapter` generates preview URLs for host routes. Route paths, schemas, content, and cache tags remain in the host; these contracts intentionally do not define or expose them.

Compose the optional host services independently and pass the existing auth and media adapters to components that consume them:

```ts
import type { AdminAuthAdapter, AdminHostAdapters, AdminMediaAdapter } from "@yesvus/helmdeck";

export const authAdapter: AdminAuthAdapter = { getSession, login, logout };
export const mediaAdapter: AdminMediaAdapter = { list, upload };
export const hostAdapters: AdminHostAdapters = {
  permissions,
  persistence,
  locale,
  audit,
  preview,
  cache,
};
```

Each host can provide only the services it uses. Callback failures and authorization decisions remain the host's responsibility; callers should handle rejected promises at their application boundary. Helmdeck's adapter types describe integration seams, they do not imply a built-in backend or prescribe a database, schema, route, or cache implementation.

## Localization

`AdminI18nProvider` supplies the active dictionary to the shell and reusable components. It defaults to Turkish; pass `locale="en"` for the built-in English dictionary. Register an additional dictionary in a client module so the registration and provider share the same browser bundle:

```tsx
"use client";

import {
  AdminI18nProvider,
  defineAdminMessages,
  englishAdminMessages,
  type AdminMessages,
} from "@yesvus/helmdeck";

const germanMessages: AdminMessages = {
  ...englishAdminMessages,
  locale: "de",
  searchLocale: "de-DE",
  shell: {
    ...englishAdminMessages.shell,
    searchLabel: "Administrationsseiten durchsuchen",
  },
};

defineAdminMessages(germanMessages);

export function GermanAdminProvider({ children }: { children: React.ReactNode }) {
  return <AdminI18nProvider locale="de">{children}</AdminI18nProvider>;
}
```

A server layout can import and render `GermanAdminProvider`; it should not call `defineAdminMessages` directly in the server module.

### Interface locale and content locale

Hosts that edit content in more than one language keep the two apart: the interface language a maintainer reads, and the content language being edited. Pass a `localeAdapter` and the shell resolves both, independent of each other:

```tsx
"use client";

import { AdminI18nProvider, type AdminLocaleAdapter } from "@yesvus/helmdeck";

const adapter: AdminLocaleAdapter = {
  getInterfaceLocale: () => "tr",
  getContentLocale: () => "en",
  setContentLocale: (locale) => router.push(`?locale=${locale}`),
  toHref: (href, contentLocale) => `${href}?locale=${contentLocale}`,
};

export function AdminLocaleProvider({ children }: { children: React.ReactNode }) {
  return <AdminI18nProvider localeAdapter={adapter}>{children}</AdminI18nProvider>;
}
```

- `getInterfaceLocale` selects the interface dictionary and still falls back to Turkish.
- `getContentLocale` and `setContentLocale` are read and written through `useAdminContentLocale()`, so a host can render its own content-language control.
- `toHref` is how the host states its own URL shape. The shell applies it to sidebar and mobile navigation, breadcrumbs, the brand link, and the profile link, so content locale survives navigation. Omit it and every href is left untouched.

Getters may return promises; the provider resolves them after first paint. The fixture at `/locale` runs a Turkish interface with an English content locale.

## Charts

Charts are drawn by this package, with no charting dependency. `AdminTimeSeriesChart` plots one or
more series over an ordered set of categories, as bars or as lines, and `AdminRankChart` ranks named
things against a labelled axis. `AdminChartFrame` is the card they live in, and it carries the four
states a load can be in.

Bring your own data. These components take points and draw them, so what appears on screen is
whatever the host's own query returned, and the only thing the package decides is how to draw it.

### States

`AdminChartFrame` takes the status straight from a load, so there is one answer to what a chart looks
like rather than one per page. The names are the load hook's own: `loading`, `empty`, `error`, and
`ready`.

```tsx
"use client";

import { AdminChartFrame, AdminTimeSeriesChart, adminChartFormatters } from "@yesvus/helmdeck";
import { BarChart3 } from "lucide-react";
import { useAdminWidgetData } from "@yesvus/helmdeck";

const definition = {
  id: "revenueByDay",
  title: "Revenue by day",
  sizes: ["lg"] as const,
  // Emptiness is a fact about the data, so it is declared rather than inferred from a length.
  isEmpty: (data: { days: Array<{ value: number }> }) => data.days.every((day) => day.value === 0),
  render: () => null,
};

export function RevenueChart({ load }: { load: () => Promise<{ days: Array<{ key: string; label: string; value: number }> }> }) {
  const { state, refetch } = useAdminWidgetData({ definition, load });

  return (
    <AdminChartFrame
      icon={BarChart3}
      title="Revenue by day"
      status={state.status}
      error={state.status === "error" ? state.error : undefined}
      onRetry={refetch}
    >
      {state.status === "ready" ? (
        <AdminTimeSeriesChart
          ariaLabel="Revenue by day"
          categories={state.data.days}
          series={[{ key: "revenue", label: "Revenue", values: state.data.days.map((day) => day.value) }]}
          formatters={adminChartFormatters("money")}
          integerTicks
        />
      ) : null}
    </AdminChartFrame>
  );
}
```

- `loading` draws a placeholder in the shape the content is about to take, announced to assistive technology.
- `error` shows the failure's own message and, when `onRetry` is given, a retry that is that load's own `refetch`.
- `empty` is reached because the data said so, through the definition's `isEmpty`. Nothing else in the component can produce it.

### Money stays an integer

Every amount crosses the boundary as a whole number of cents. Sum, compare and scale that integer, and
divide by 100 in the formatter, which is the only place it happens:

```ts
import { adminAggregate, adminChartDayKey, adminChartDayRange, adminWholeNumber, adminFormatCents } from "@yesvus/helmdeck";

const revenue = adminAggregate({
  rows: orders,
  range: adminChartDayRange(30, new Date()),
  key: (order) => adminChartDayKey(order.created_at),
  measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
});

revenue.totals.cents; // integer throughout, and the sum of the buckets beside it
adminFormatCents(revenue.totals.cents); // "$1,290.00"
```

A total assembled by adding formatted strings reads correctly on screen and disagrees with the ledger
as soon as rounding is involved, so `adminFormatCents` and `adminFormatCentsCompact` are the only
places the division happens. `adminChartFormatters("money")` gives the pair for a chart: every digit
for a tooltip, shortened for an axis.

### Bucketing rows into a chart's points

`adminAggregate` is the measuring half of a chart. The package shipped the chart and the day range;
without this, every host wrote the same three things again: which rows are which period, what a day
with no rows is, and a total that agrees with the points it is read out loud beside.

```ts
import { adminAggregate, adminChartDayKey, adminChartDayRange, adminWholeNumber } from "@yesvus/helmdeck";

const revenue = adminAggregate({
  rows: orders,                                    // rows you have already read
  range: adminChartDayRange(30, new Date()),       // the periods the answer covers
  key: (order) => adminChartDayKey(order.created_at),
  label: (key) => key,
  measures: { cents: (order) => adminWholeNumber(order.total_cents, "total_cents") },
});

revenue.buckets;     // one per day in the range, zero included, in range order
revenue.totals.cents; // the sum of those buckets
revenue.outOfRange;  // rows the range excluded
revenue.unkeyed;     // rows whose key named no period
```

- **Every period in the range appears, holding a zero where nothing landed on it.** A store holds no
  row for a day nothing happened, so a chart built from the rows alone draws a straight line across
  the gap and the reader concludes it is a trend. A range with no rows at all comes back as a full
  run of zeros, which is how the empty state is reached by the data rather than by a host writing it.
- **A row outside the range is in neither the buckets nor the totals**, and is counted in
  `outOfRange`. Bounded at both ends, so a row dated after the last day is not in the figure the tile
  reads aloud beside a chart that does not draw it. A total the chart does not show is the
  disagreement this exists to prevent.
- **A row the key cannot place is in neither, and is counted in `unkeyed`.** Filing an undated order
  under the epoch would drop every one of them into the first bucket and turn a chart into a statement
  about the parse, so the count is reported instead of the row being dropped in silence.
- **The totals are summed off the buckets**, not accumulated beside them, so a range total cannot
  drift from the series it sits next to.
- **A sum that outgrows what a number holds is refused, not returned.** Each value is checked on the
  way in and each addition on the way along, because two thousand rows of `9_000_000_000_000` are each
  exactly representable and add up to a figure that is not. The refusal names the measure and the
  period, and says what to do: narrow the range, or measure in a unit a number can sum. A measure of
  fractions is left alone, since `0.1 + 0.2` is not `0.3` for reasons that have nothing to do with a
  boundary.

`adminChartDayKey` reads the UTC day out of both shapes a store produces: SQLite's `datetime('now')`
and an ISO timestamp. A value that is not a timestamp is refused rather than filed under a guessed
day. A key is a string, and any key space a host wants works, because the range is compared as a set
of the same keys.

`adminAggregateTotals` is the same measures over the same rows with nothing grouped, for the figures
a tile reads beside its chart rather than on it. `adminWholeNumber` is the integer guard to read a
column through, and it refuses rather than coerces, so a column holding a float surfaces as an error
in the tile rather than as a total that reads correctly and is wrong.

**It runs in memory, over the rows you have already read, and that is the whole of the cost.** Thirty
points can come from a million orders, but they come from reading all million of them: an
`AdminPersistenceAdapter` answers with rows, and nothing here can ask the store to aggregate. A host
whose table outgrows one dashboard range needs a query contract and a store that can sum in SQL. This
is the honest boundary of the API rather than an implementation detail, and it is why the demo's own
aggregates are computed in the fixture for the same reason.

### The axis is a scale

`adminChartTicks(max, count, integer)` rounds the axis top up to the next 1, 2, 2.5, 5 or 10 times a
power of ten, so the tallest mark is never taller than the axis it is drawn against and a reader can
name the peak. Pass `integer` for a domain that counts things or holds cents, where a tick at 2.5 is a
number nobody can act on.

`adminChartAxis` adds the mapping from a value to a position, and pins a value outside the domain to
an edge rather than drawing it off the plot. `adminChartLabelIndices` picks which category labels to
print, keeping the first and the last; thirty daily labels collide, and dropping them silently makes
a reader assume the gaps are missing data.

### Reading a chart without a mouse

- `AdminTimeSeriesChart` takes an `ariaLabel` that names the period and the total, and renders a table of every plotted value for a screen reader. The table is built from the same points the marks are drawn from, so it cannot disagree with them.
- `AdminRankChart` prints each value beside its bar, so the bar can be checked against the axis, and takes a `valueLabel` so a bare number is not left to be interpreted.
- Hovering a time-series column shows the date and every series' value, and a column with no data is still hoverable.

### Bringing your own colors

Series take their colors from the theme's tokens, so they follow a tenant's accent and its dark mode
without a chart knowing either. The default palette is a list of complete class names, because
Tailwind generates a utility only when it can read the whole class in the source, so a composed
`fill-${color}` produces nothing. The second series is the muted grey on purpose: a comparison series
quieter than the one it is compared against reads as context. Override it with `seriesClasses`.

## Dashboard tiles

The package ships the six tiles a dashboard is mostly made of. Declare one, register it, and give it
a loader. You do not write a component, and you do not write a spinner, an empty state, or an error
state, because those are the engine's and each tile renders the same four of them.

```tsx
"use client";

import {
  AdminDashboardTiles,
  adminStatWidget,
  adminTableWidget,
  createAdminWidgetRegistry,
  type AdminWidgetLoader,
} from "@yesvus/helmdeck";
import { countRevenue, recentOrders } from "../lib/orders";

type Order = { id: string; customer: string; cents: number };

const registry = createAdminWidgetRegistry({
  revenue: adminStatWidget({
    id: "revenue",
    title: "Revenue",
    unit: "money",
    value: (data: { cents: number; lastMonthCents: number }) => data.cents,
    previous: (data: { cents: number; lastMonthCents: number }) => data.lastMonthCents,
    comparison: "vs last month",
    empty: { title: "No revenue yet", body: "No paid order has been placed." },
  }),
  orders: adminTableWidget<Order>({
    id: "orders",
    title: "Recent orders",
    rows: (rows) => rows,
    columns: [
      { key: "customer", header: "Customer", value: (row) => row.customer },
      { key: "cents", header: "Total", value: (row) => row.cents },
    ],
    getKey: (row) => row.id,
    unit: "money",
  }),
});

const loaders = {
  revenue: countRevenue as AdminWidgetLoader<{ cents: number; lastMonthCents: number }>,
  orders: recentOrders as AdminWidgetLoader<Order[]>,
};

export function SalesBoard({ placements }: { placements: AdminDashboardPlacement[] }) {
  return <AdminDashboardTiles registry={registry} placements={placements} loaders={loaders} />;
}
```

Each tile decides the thing a host would otherwise decide on every project:

- `adminStatWidget` colours itself from its own trend: a rise reads good, a fall reads bad, and `invertTrend` swaps that for churn, refunds and error rates. A figure of zero is drawn as a figure, because $0.00 is a fact and an empty tile is a claim. A trend is drawn only where a rate exists, so a rise from zero does not become a percentage of nothing.
- `adminTableWidget` works out from the data alone that a column is numbers, right-aligns it and formats it, which is why the example above writes a `value` and no `cell`. Rows are capped and the tile says how many it left out.
- `adminListWidget` truncates a long label, keeps its full text reachable, and holds the figure beside it at a fixed width.
- `adminChartWidget` maps rows onto `AdminTimeSeriesChart` and `adminRankWidget` onto `AdminRankChart`, deciding the formatters, the whole-number ticks, and the sentence a screen reader reads in place of the drawing. They are separate because a ranking and a time series answer different questions, and plotting ranked rows along a dated axis says something false about them.
- `adminActivityWidget` owns the age thresholds a host otherwise gets subtly wrong, reads them against a clock at render time rather than at query time, and maps each event's kind to a tone so a feed can be scanned.

### Every tile has the same four states

`state.status` is handed straight through, so loading, empty, error and ready are the engine's answers
and a tile has no way to disagree with them. Each shipped tile claims the loading and empty states,
because both are shaped like the thing that is arriving, and claims neither error nor ready:

- `loading` is a placeholder in the shape of the content, so a tile does not change height when its data lands.
- `error` is left to the engine, which shows the failure's own message and the retry that is the load's own `refetch`. A tile that wrote its own error copy could not show the engine's message.
- `empty` is reached because the data said so. A host whose metric reads zero as absent passes its own `isEmpty`; one with domain words for the case passes `empty`.

A query that answers with a shape the host did not expect empties that one tile. It does not throw,
because a dashboard that loses its page to one row is a worse outcome than a tile with nothing in it.

### Declaring a tile you did not get here

A tile is a plain object with no hooks, no directive and no state, so a server component can build a
registry of them and render it through `AdminWidgetPanel` with states it resolved itself. The two
chart tiles are a client module, because the charts are, so they are declared in a client module
alongside the tiles that use them. `defineAdminWidget` declares a tile the package does not ship, and
`AdminWidgetDefinition` is the contract to write it against.

### Words a tile prints itself

`defaultAdminShippedWidgetLabels` holds every sentence a shipped tile writes on its own: the note
under a capped tile, the ages in a feed, the direction a trend moved. A host overrides any of them
per tile with `labels`, or replaces the whole age vocabulary with `formatAge`. The counts are
functions rather than templates, so a sentence that takes a number is never assembled by this package
on a host's behalf.

## Media adapters

The package does not choose a storage provider. Implement `AdminMediaAdapter` for the host's list, upload, external-link, rename, and delete operations, then pass it to `AdminMediaUpload`, `AdminMediaPicker`, `AdminMediaField`, or `AdminMediaGalleryField`.

## Development

### Contextual help

Use `AdminContextualHelp` to keep secondary explanations available without adding persistent copy to a page. The info button opens its tooltip on hover, keyboard focus, or touch activation. It exposes an accessible label and description, and Escape dismisses the open tooltip.

```tsx
import { AdminContextualHelp } from "@yesvus/helmdeck";

<h2>Analytics <AdminContextualHelp label="About analytics">
  Definitions for the workspace metrics.
</AdminContextualHelp></h2>
```

Optional `hint`, `description`, `subtitle`, and stat `detail` content on the field and layout primitives use the same contextual pattern. Keep validation errors, warnings, and actionable status visible.

- `pnpm install`
- `pnpm dev` starts the fixture app.
- `pnpm typecheck` checks the package and fixtures.
- `pnpm lint` runs ESLint.
- `pnpm test` runs the package tests.
- `pnpm build` emits the package to `dist/`.
- `pnpm build:fixtures` builds the production fixture app.
- `pnpm verify:layout` measures the built fixture app in a real browser. The unit tests read class
  attributes, which cannot see a utility missing from the stylesheet or losing to another by source
  order. It needs a production fixture build and a running server:
  `pnpm build:fixtures && pnpm exec next start fixtures -p 4319`, then `pnpm verify:layout` in
  another shell. It uses the Playwright CLI, which is not a package dependency:
  `npm i -g @playwright/cli && playwright-cli install-browser chromium`.
