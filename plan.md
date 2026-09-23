# helmdeck - extraction plan

## Purpose

A reusable, MIT-licensed admin shell for Next.js App Router projects. Extracted
from the admin panels of Birted Commerce and Leotron so both share one shell
instead of maintaining two.

## Goal

- One package for layout, navigation, primitives, and adapter contracts.
- Each app supplies its session, navigation config, auth adapter, and media
  adapter.
- Makes multi-tenancy cheaper: tenant branding, navigation, and role gating
  become one config surface in the package.

## Scope

### In the shell (generic)

- Layout: `AdminShell`, collapsible sidebar, topbar, mobile nav, breadcrumbs,
  search, profile menu, login screen.
- Primitives: button, form field / input / select, toast, status pill, empty
  state, destructive-action confirm, submit button, table, pagination, modal,
  sortable list, skeleton.
- Adapter contracts (types only).
- Theme tokens.
- Optional, later: media library / media picker.

### Out (stays app-specific)

- Domain entities and data access (products, orders, categories for Birted;
  blog, dealers, hero, translations, revisions for Leotron).
- Auth provider implementation (custom sessions vs better-auth).
- Database / drizzle schemas, payments, shipping, invoicing.
- Storefront UI.

## Tech

- Next.js App Router (client components), React 19, Tailwind v4, TypeScript 5.
- Radix UI + lucide-react.
- Peer deps: `next`, `react`, `react-dom`, `tailwindcss`, `@radix-ui/*`,
  `lucide-react`.
- No `@trendyol/baklava` (Birted keeps it for domain screens only), no DB, no
  domain code.

## Package structure

```
src/
  index.ts
  shell/        AdminShell, AdminNav, AdminMobileNav, AdminBreadcrumbs,
                AdminSearch, AdminProfileMenu, AdminLoginScreen
  primitives/   button, field, input, select, toast, status-pill, empty-state,
                destructive-action, submit-button, table, pagination, modal,
                sortable-list, skeleton
  adapters/     AdminSession, AdminNavGroup, AdminAuthAdapter, AdminMediaAdapter
  theme/        tokens, css variables
```

## Adapter contracts

- `AdminSession`: `{ email, name?, role }`
- `AdminNavGroup`: `{ label, items: { href, label, icon?, roles? }[] }`
- `AdminAuthAdapter`: `getSession()`, `login(credentials)`, `logout()`
- `AdminMediaAdapter`: `upload(file)`, `list(query)`, `getUrl(key)`

## Base

Start from Leotron's shell (config-driven, role-aware, collapsible, mobile nav,
search, breadcrumbs). Generalize it, then have Birted adopt the package.

## Extraction phases

1. Scaffold the package and port the shell layout, nav, profile menu, mobile
   nav, breadcrumbs, and search from Leotron.
2. Port primitives (Leotron `admin-ui`, form fields, toast, status pill, empty
   state, destructive action, submit button, sortable list, skeleton).
3. Define the adapters and make Leotron consume the package.
4. Port Birted's shell onto the package (config-driven nav, drop baklava from
   the shell itself).
5. Optional: media library / media picker.
6. Publish v0.1.0.

## Integration per app

Each app keeps a thin `(panel)/layout.tsx` that:

- resolves the session (custom sessions / better-auth),
- builds the role-filtered navigation groups,
- renders `<AdminShell session={...} nav={...} onLogin={...} onLogout={...} />`.

## Open decisions

- Package name and npm scope.
- Distribution: npm package vs git dependency.
- Whether the media library ships in v0.1 or is deferred.
- Theme token names and brand accent.
- Headless (unstyled) vs a styled default.

## Non-goals

- Replacing app domain code.
- Being a CMS or a commerce engine.
- Server-side data access.
