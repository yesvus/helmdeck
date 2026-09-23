# Phase 2 - Primitives

Port Leotron `admin-ui`, drop domain styles.

- [x] button, submit-button.
- [x] field, input, select.
- [x] toast.
- [x] status-pill, empty-state, skeleton.
- [x] table, pagination, modal.
- [x] destructive-action confirm, sortable-list.
- [x] Consistent props, Radix + lucide-react only.

## Where it lives

- Components: `src/primitives/`, exported from the package root.
- Story: `fixtures/app/primitives/page.tsx`, run with `pnpm dev`, route
  `/primitives`.
- Peer deps added: `@radix-ui/react-slot`, `@radix-ui/react-dialog`.

## Source picks

Applied the arbitration rule from [decisions](../decisions.md).

- Leotron: button, submit button, field and section wrappers, toast, status
  pill, empty state, skeletons, table styling, destructive confirm behavior.
- Birted: dialog accessibility base. Its Radix `ui/dialog` replaces Leotron's
  hand-rolled focus trap, skinned to Leotron's dialog look.
- Birted: pagination pieces, rebuilt on this package's `Button` with English
  labels.
- Native select styled to match `AdminInput`, which keeps `AdminField`'s label
  wrapping working. Birted's Radix select would force that contract to change.
- Table: neither app had a generic one, so it is written here as a
  column-config component over their shared row styling.

## Open pick

- Sortable list runs on native HTML5 drag plus move up/down buttons. Leotron's
  version uses `@dnd-kit`, which adds touch dragging and live-region
  announcements at the cost of three more peer deps. The dependency list stops
  at Radix + lucide-react, so the swap needs a call.
