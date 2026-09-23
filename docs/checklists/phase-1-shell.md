# Phase 1 - Shell layout

Port from Leotron, generalize.

- [x] `AdminShell` layout with collapsible sidebar, topbar.
- [x] `AdminNav` config-driven, role-aware filtering.
- [x] `AdminMobileNav` drawer behavior.
- [x] `AdminBreadcrumbs`, `AdminSearch`, `AdminProfileMenu`.
- [x] `AdminLoginScreen` presentational (no auth logic).
- [x] Tenant branding hook (logo, accent via CSS vars).
- [x] Story or fixture page per component for manual check.

## Where it lives

- Components: `src/shell/`.
- Nav and session types, role filtering: `src/adapters/`.
- Brand accent and tokens: `src/theme/`.
- Stories: `fixtures/`, run with `pnpm dev`.

## Generalizations applied over the Leotron source

- English default labels, overridable through the `labels` prop.
- Locale-aware links dropped; the host app owns locale routing.
- `roles: string[]` on nav items instead of a hardcoded admin flag.
- Domain search shortcuts replaced by `keywords` on items plus a
  `searchEntries` prop.
- Active route match on path boundary, so `/shell` no longer swallows
  `/shell/products`.
- Branding: `brand.logo` slot and `useAdminBranding(accent)` writing
  `--color-brand-{100,500,600}` on the shell root.
