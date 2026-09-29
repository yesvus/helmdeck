# Helmdeck

Helmdeck is a reusable, MIT-licensed admin interface package for Next.js App Router applications. It provides a responsive shell, accessible UI primitives, typed localization dictionaries, and adapter-backed media workflows while leaving authentication, data access, routes, and domain operations to the host application.

## Included

- Responsive shell with navigation, command search, breadcrumbs, profile actions, mobile navigation, and login presentation.
- Form workflows with dirty-state tracking, autosave support, pending buttons, repeaters, URL feedback, and status primitives.
- Data-heavy primitives including tables, pagination, modals, toasts, skeletons, sortable lists, and destructive confirmations.
- Charts drawn by the package with no charting dependency: a time series over days, a ranked bar chart, and the card they live in with its loading, empty and failed states.
- Media upload, picker, single-value fields, gallery fields, placeholders, sorting, and adapter contracts.
- English and Turkish dictionaries with formal Turkish UI copy. Register additional dictionaries with `defineAdminMessages`.
- A static bilingual fixture app for the hosted demo.

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

Sessions and the sign-out-everywhere control are yours to supply, because `AdminSession` carries no timestamps and the auth contract cannot revoke other sessions. Where you cannot honour one, the page leaves it out rather than rendering a control that does nothing.

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

This method is about ending your own sessions everywhere. Ending a *different* account's sessions is a different capability, and the demo shows how to authorize it in its own action, where the target and the authority are resolved together rather than one being handed to the other.

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

`AdminResourceList` and `AdminResourceForm` generate the list and detail views from that, with each control wrapped in the resource's own permissions. `adminResourceValues` reads only the declared fields, so a field removed from the definition cannot be smuggled back in through a hand-edited request. The definition is a plain description: nothing in it reads or writes, so it can also be used as route-generation input.

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

**A query that crosses the server is read or refused.** `createAdminResourceActions` reads the query it is handed before it asks about the session, and refuses anything it cannot read: a part that is not part of a query, a field name that is not a field, an ordering that is not ascending or descending, a comparison with nothing to compare to, an offset that is not a whole record, a window of no rows, and a window larger than the contract allows. The refusal is deliberate, because the adapters this contract grew out of read every key they are given as a field to match exactly: a `sort` was a column named `sort`, and a `limit` was a filter nothing matched. A store is not handed a guess about what a caller meant.

`query` on the actions is still the rows-only read, and its argument is passed through as the host's adapter takes it. A host that wants its queries read, checked and counted asks for `queryPage`, and a host whose adapter has no `queryPage` is not offered one, so a list mounted on the actions sees the same capabilities it would see mounted on the adapter itself.

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

`createMemoryPersistenceAdapter` is CRUD over plain objects, which is enough for a fixture or a test with no database. It hands out copies in both directions, so a caller cannot edit stored state without going through `update`. `createAuditAdapter` and `createCacheAdapter` are thin defaults that swallow their own failures, because the change has already happened by the time either runs; both take an `onError` so the failure is still observable.

### The SQLite adapter

`createSqlitePersistenceAdapter` is the same CRUD over a real database, with no schema to design first. Point it at a path and it creates the table it stores in on the first call.

```ts
import { createSqlitePersistenceAdapter } from "@yesvus/helmdeck/baseline";

export const persistence = createSqlitePersistenceAdapter({ url: "file:./helmdeck.db" });
```

A path with no scheme is a local file, so `file:./helmdeck.db` and `./helmdeck.db` are the same store. The same adapter takes `libsql://` with an `authToken` for a hosted database, so the local file grows into hosted storage by changing a string rather than by changing code.

Records are stored as JSON documents keyed by resource and id, which is why no schema is needed: any resource works on the first call, and an id you supply is the id that is stored, so seeded rows keep pointing at each other.

Filters are exact matches on a stored value, so a filter is a string, a number, a boolean or `null`. Each predicate states the JSON type it expects, which is what keeps a filter for `1` from being answered by a record storing `true`, and lets `null` find a record storing `null` rather than matching nothing at all. A filter carrying an object or an array is refused with an error rather than compared as text, because text comparison matches on key order and would quietly return the wrong rows.

This adapter answers `query` and nothing else, so a list reading through it renders every record it was given, with no search, sorting, filtering, paging or count. Adding `queryPage` to it is the whole of the change: run the same filters, order and slice what `AdminResourceQuery` asks for, and report the count the filters matched before the window.

This is the adapter to start on. A filter runs through `json_extract`, which SQLite cannot index the way it can a column, so once a resource is large enough that the scan shows, put it behind a mapped schema and the same `AdminPersistenceAdapter`.

## Host integration contracts

`AdminAuthAdapter` resolves the current session and handles login/logout. `AdminPermissionsAdapter` answers host-defined permission checks; shell navigation role filtering is presentation only and never replaces route or operation authorization. The host owns identity, session lifetime, credentials, permission names, and the rule itself; the package supplies the two ends that ask it.

`AdminPersistenceAdapter` is a generic boundary for host data reads and writes. Resource names, data types, validation schemas, transactions, and domain rules remain host-owned. `AdminMediaAdapter` owns media listing, upload, and media mutations; storage, URL signing, and retention remain host responsibilities.

`AdminLocaleAdapter` distinguishes interface locale from content locale. Interface dictionaries are provided by Helmdeck, while the host chooses locale policy and owns translations and localized content. Optional content-locale selection persists through the host callback.

`AdminAuditAdapter` accepts host audit events. `AdminPreviewAdapter` generates preview URLs for host routes. `AdminCacheInvalidationAdapter` receives resource operations so the host can invalidate its own caches. Route paths, schemas, content, and cache tags remain in the host; these contracts intentionally do not define or expose them.

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
import { adminChartDayKey, adminChartDayRange, adminChartFillDays, adminFormatCents } from "@yesvus/helmdeck";

const cents = orders.reduce((total, order) => total + order.total_cents, 0); // integer throughout
const days = adminChartFillDays(
  adminChartDayRange(30, new Date()),
  revenueByDay(orders), // keyed by adminChartDayKey(order.created_at)
  (key) => key,
);

adminFormatCents(cents); // "$1,290.00"
```

A total assembled by adding formatted strings reads correctly on screen and disagrees with the ledger
as soon as rounding is involved, so `adminFormatCents` and `adminFormatCentsCompact` are the only
places the division happens. `adminChartFormatters("money")` gives the pair for a chart: every digit
for a tooltip, shortened for an axis.

### Every day in the range, including the zeros

`adminChartDayRange(days, end)` returns the day keys ending on the day containing `end`, and
`adminChartFillDays` emits a point for each of them whether or not a row exists. A store holds no
row for a day nothing happened, so a chart built from the rows alone draws a straight line across the
gap and the reader concludes it is a trend. A range with no rows at all comes back as a full run of
zeros, which is how the empty state is reached by the data rather than by a host writing it.

`adminChartDayKey` reads the UTC day out of both shapes a store produces: SQLite's
`datetime('now')` and an ISO timestamp. A value that is not a timestamp is refused rather than filed
under a guessed day.

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
