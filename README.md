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
pnpm add https://github.com/yesvus/helmdeck/releases/download/v0.1.0-alpha.1/yesvus-helmdeck-0.1.0-alpha.1.tgz
```

Prerelease artifacts are distributed through GitHub releases. npm publication is postponed indefinitely.

## Releases

`VERSION` is the canonical release version and must match `package.json`. The release workflow accepts explicit alpha, beta, stable, patch, minor, and major transitions, runs the full quality gate, tags the release, and attaches the package tarball with a SHA-256 checksum. Alpha and beta releases are marked as GitHub prereleases. Stable releases move the floating `v0` tag; prereleases leave it unchanged. Consumers should upgrade by replacing the exact release tarball URL and refreshing the lockfile.

Run `pnpm version:check` to verify version metadata locally. Use `pnpm version:next <bump>` to preview a transition without changing files.

Import the theme tokens once in the host stylesheet:

```css
@import "tailwindcss";
@import "@yesvus/helmdeck/theme.css";
```

## Themes and design tokens

Helmdeck defaults to the light theme and an accessible amber primary (`#b45309`). The host selects color mode by setting `data-admin-theme="light"` or `data-admin-theme="dark"` on the document root or an ancestor. The attribute can be rendered server-side to avoid a mode flash. Helmdeck does not persist theme choices; the host owns persistence and synchronization. Omit the attribute for the default light theme.

Theme CSS exposes `--admin-surface`, `--admin-surface-muted`, `--admin-surface-subtle`, `--admin-overlay`, `--admin-media-backdrop`, `--admin-border`, `--admin-border-strong`, `--admin-text-primary`, `--admin-text-secondary`, `--admin-text-muted`, `--admin-text-disabled`, `--admin-brand-100`, `--admin-brand-500`, `--admin-brand-600`, `--admin-brand-text`, and `--admin-on-brand`. Feedback tokens are grouped by role: warning, danger, and success each define surface, text, and border tokens; danger and success also define action, action-hover, and action-foreground tokens. Typography, spacing, radius, and density are represented by `--admin-font-family`, `--admin-spacing`, `--admin-radius`, and `--admin-density`. Tailwind semantic utilities used by shared components resolve these values inline, so wrapper-level and tenant overrides flow through to the components. Override the variables on a host wrapper or `:root` to customize tenant branding. `useAdminBranding(accent)` provides the primary color and contrasting foreground for a validated hex accent.

Keep normal text/background combinations at WCAG AA contrast (4.5:1), and large text and UI boundaries at 3:1. The default amber action color is `#b45309`, which exceeds 4.5:1 against white. All theme controls should remain native keyboard-operable inputs, selects, and buttons. The fixture at `/theme` demonstrates light/dark mode, live token editing, reset, and JSON preset import/export.

## Quick start

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

The host owns session resolution, authorization, persistence, route protection, and content-language state. Helmdeck receives configuration and callbacks through explicit props and adapters.

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

## Media adapters

The package does not choose a storage provider. Implement `AdminMediaAdapter` for the host's list, upload, external-link, rename, and delete operations, then pass it to `AdminMediaUpload`, `AdminMediaPicker`, `AdminMediaField`, or `AdminMediaGalleryField`.

## Development

- `pnpm install`
- `pnpm dev` starts the fixture app.
- `pnpm typecheck` checks the package and fixtures.
- `pnpm lint` runs ESLint.
- `pnpm test` runs the package tests.
- `pnpm build` emits the package to `dist/`.
- `pnpm build:fixtures` builds the production fixture app.
