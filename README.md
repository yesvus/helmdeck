# Helmdeck

Helmdeck is a reusable, MIT-licensed admin interface package for Next.js App Router applications. It provides a responsive shell, accessible UI primitives, typed localization dictionaries, and adapter-backed media workflows while leaving authentication, data access, routes, and domain operations to the host application.

## Included

- Responsive shell with navigation, command search, breadcrumbs, profile actions, mobile navigation, and login presentation.
- Form workflows with dirty-state tracking, autosave support, pending buttons, repeaters, URL feedback, and status primitives.
- Data-heavy primitives including tables, pagination, modals, toasts, skeletons, sortable lists, and destructive confirmations.
- Media upload, picker, single-value fields, gallery fields, placeholders, sorting, and adapter contracts.
- English and Turkish dictionaries with formal Turkish UI copy. Register additional dictionaries with `defineAdminMessages`.
- A static bilingual fixture app for the hosted demo.

## Install

```bash
pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.3.0/yesvus-helmdeck-0.3.0.tgz
```

Release artifacts are distributed through GitHub releases. npm publication is postponed indefinitely.

## Releases

`VERSION` is the canonical release version and must match `package.json` and the install command above. The release workflow accepts explicit alpha, beta, stable, patch, minor, and major transitions, runs the full quality gate, tags the release, and attaches the package tarball with a SHA-256 checksum. Alpha and beta releases are marked as GitHub prereleases. Stable releases move the floating `v0` tag; prereleases leave it unchanged. Consumers should upgrade by replacing the exact release tarball URL and refreshing the lockfile.

A release rewrites the install command in the same commit as the version bump, so the documented URL never lags a release. Run `pnpm version:check` to verify version metadata locally; it fails when the three disagree. Use `pnpm version:next <bump>` to preview a transition without changing files.

### Pinning, upgrades, and rollback

Install an immutable release artifact by exact version and URL. Do not pin consumers to a moving branch, `latest`, or the floating `v0` tag. Verify the downloaded tarball against the SHA-256 checksum attached to its GitHub release, then commit the updated dependency and lockfile together. Deploy the same lockfile artifact through environments.

To upgrade, review the release notes and compatibility section, update the exact tarball URL, refresh the lockfile, and run the host's typecheck, tests, and production build before deployment. Roll back by restoring the previous exact artifact URL and lockfile from version control, then redeploy. Helmdeck does not modify its installed code or migrate host data.

Patch and minor releases preserve existing public APIs and adapter behavior. A breaking public API or adapter contract change requires a major-version transition and a migration note; prereleases may introduce such changes and are intended for evaluation. Release notes identify public API and adapter additions, deprecations, and breaking changes. Consumers should treat the TypeScript declarations shipped in each artifact as the contract for that version.

Import the theme tokens once in the host stylesheet:

```css
@import "tailwindcss";
@import "@yesvus/helmdeck/theme.css";
```

## Themes and design tokens

Helmdeck defaults to the light theme and an accessible amber primary (`#b45309`). The host selects color mode by setting `data-admin-theme="light"` or `data-admin-theme="dark"` on the document root or an ancestor. The attribute can be rendered server-side to avoid a mode flash. Helmdeck does not persist theme choices; the host owns persistence and synchronization. Omit the attribute for the default light theme.

Theme CSS exposes `--admin-surface`, `--admin-surface-muted`, `--admin-surface-subtle`, `--admin-overlay`, `--admin-media-backdrop`, `--admin-border`, `--admin-border-strong`, `--admin-text-primary`, `--admin-text-secondary`, `--admin-text-muted`, `--admin-text-disabled`, `--admin-brand-100`, `--admin-brand-500`, `--admin-brand-600`, `--admin-brand-text`, and `--admin-on-brand`. Feedback tokens are grouped by role: warning, danger, and success each define surface, text, and border tokens; danger and success also define action, action-hover, and action-foreground tokens. Typography, spacing, radius, and density are represented by `--admin-font-family`, `--admin-spacing`, `--admin-radius`, and `--admin-density`. Tailwind semantic utilities used by shared components resolve these values inline, so wrapper-level and tenant overrides flow through to the components. Override the variables on a host wrapper or `:root` to customize tenant branding. `useAdminBranding(accent)` provides the primary color and contrasting foreground for a validated hex accent.

Keep normal text/background combinations at WCAG AA contrast (4.5:1), and large text and UI boundaries at 3:1. The default amber action color is `#b45309`, which exceeds 4.5:1 against white. All theme controls should remain native keyboard-operable inputs, selects, and buttons. The fixture at `/theme` demonstrates light, dark, and system mode, OS preference updates, live token editing, reset, and JSON preset import/export.

## Quick start

### Dialog layout

`AdminModalContent` keeps its existing direct-child API and scrolls its content. For long forms, compose `AdminModalHeader`, `AdminModalBody`, and `AdminModalFooter` explicitly. The header and footer remain visible while the body scrolls, and footer actions stack on narrow screens. Set `preventClose` while a submission is pending to block Escape, outside-click, and close-button dismissal. Destructive confirmations use `AdminDestructiveAction` and remain separate from ordinary dialogs.

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

## Host integration contracts

`AdminAuthAdapter` resolves the current session and handles login/logout. `AdminPermissionsAdapter` answers host-defined permission checks; shell navigation role filtering is presentation only and never replaces route or operation authorization. The host owns identity, session lifetime, credentials, permission names, and enforcement.

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
