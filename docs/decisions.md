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

## Source arbitration

When Leotron and Birted both have a version of the same thing:

- Default to Leotron. It carries the config-driven, role-aware shell the plan
  names as the base, and it is the further along of the two.
- Take Birted when its version is visibly better for a UI detail. Recorded per
  pick below, so phase 4 adoption does not have to re-decide.
- When neither clearly wins, keep Leotron and note the open pick here for a
  human look, rather than merging both.

Picks so far:

- Top bar: Birted. Sticky bar with title left and profile menu right, over
  Leotron's bare content area. Its profile menu moved into the bar, so
  `AdminProfileMenu` grew a `variant` (`sidebar` | `topbar`).
- Dialog base: Birted's Radix `ui/dialog`, skinned to Leotron's dialog look.
  Replaces Leotron's hand-rolled focus trap.
- Pagination: Birted's pieces, rebuilt on this package's `Button`, English
  labels.
- Button, field wrappers, submit button, toast, status pill, empty state,
  skeletons, table styling: Leotron.
- Select: native, styled to match `AdminInput`, so `AdminField`'s label
  wrapping keeps working.
- Sortable list: neither. Rebuilt on native HTML5 drag plus move buttons,
  because Leotron's `@dnd-kit` version sits outside the dependency list.
  Open pick: move to `@dnd-kit` for touch dragging and announcements, or keep
  the dependency list as written.

## Packaging notes

- The package ships TypeScript source (`exports` point at `src/`) until the
  build step lands in phase 6. Consumers compile it through
  `transpilePackages: ["@yesvus/helmdeck"]` in the interim.
- `lucide-react` joined the peer dependencies with the shell icon map.
  Radix peers are added in phase 2 when the primitives that need them land.
