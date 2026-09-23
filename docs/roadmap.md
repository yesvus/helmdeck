# Roadmap

Derived from [plan.md](../plan.md) extraction phases.

Adoption work (M3, M4) changes Leotron and Birted, so it waits for an explicit
go-ahead. Everything before it stays inside this package.

## M0 - Name and tooling

- Decide name ([naming](naming.md)), scope, distribution.
- Add lint, build, publish config. No UI code yet.

## M1 - Shell layout (Phase 1)

Port from Leotron: `AdminShell`, nav, mobile nav, breadcrumbs, search,
profile menu, login screen. Checklist: [phase-1](checklists/phase-1-shell.md).

## M2 - Primitives (Phase 2)

Port Leotron `admin-ui`: button, field, toast, status pill, empty state,
destructive action, submit button, table, pagination, modal, sortable list,
skeleton. Checklist: [phase-2](checklists/phase-2-primitives.md).

## M3 - Adapters, Leotron adopts (Phase 3)

Freeze `AdminSession`, `AdminNavGroup`, `AdminAuthAdapter`,
`AdminMediaAdapter`. Leotron consumes package.
Checklist: [phase-3](checklists/phase-3-adapters-leotron.md).

## M4 - Birted adopts (Phase 4)

Birted moves to config-driven nav, drops baklava from shell.
Checklist: [phase-4](checklists/phase-4-birted.md).

## M5 - Media + publish (Phases 5-6)

Optional media library/picker, then v0.1.0.
Checklists: [phase-5](checklists/phase-5-media.md),
[phase-6](checklists/phase-6-publish.md).
