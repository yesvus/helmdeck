# Decisions

Carried over from plan.md open decisions. All resolved by M0/M1.

- [x] Package name and npm scope - `@yesvus/helmdeck`, see [naming](naming.md).
- [x] Distribution: npm package vs git dependency. Resolved: git dependency
  (`github:yesvus/helmdeck#v0.0.0`) for now, registry publish deferred to
  phase 6.
- [x] Media library in v0.1 or deferred. Resolved: deferred, stays phase 5.
- [x] Theme token names and brand accent. Resolved: `--color-brand-100`,
  `--color-brand-500`, `--color-brand-600` for accent, `--admin-sidebar-width`
  and `--admin-sidebar-width-collapsed` for layout. Defaults ship in
  `src/theme/tokens.css`; `useAdminBranding(accent)` overrides them per tenant.
- [x] Headless (unstyled) vs styled default. Resolved: styled, Tailwind v4
  utility classes, recolored through the brand tokens above.

## Packaging notes

- The package ships TypeScript source (`exports` point at `src/`) until the
  build step lands in phase 6. Consumers compile it through
  `transpilePackages: ["@yesvus/helmdeck"]` in the interim.
- `lucide-react` joined the peer dependencies with the shell icon map.
  Radix peers are added in phase 2 when the primitives that need them land.
