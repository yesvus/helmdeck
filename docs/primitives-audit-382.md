# Primitives audit, issue 382

Method: read the implementations and matching tests, then cross-check their structure against familiar shadcn/ui source patterns. No web fetch and no wholesale boilerplate copy. The migration adapts patterns locally to Helmdeck tokens, names and APIs. Verdicts prioritize visible test coverage, TODOs, and the complexity of edge states, not resemblance alone.

| Module | Current maturity | A11y / edge-state notes | Nearest shadcn/ui analog | Verdict |
|---|---|---|---|---|
| admin-error-view.tsx | focused error surface | Diagnostic/retry states; adapter contract | Alert | SKIP (already mature or shell-owned) |
| button.tsx | tokenized button variants | Native disabled and focus states | Button | SKIP (already mature or shell-owned) |
| calendar.tsx | capable date controls | Locale, range, outside days; keyboard grid is bespoke | Calendar | LATER |
| combobox.tsx | contract-heavy async picker | Loading/error/empty, active descendant, retry; high state surface | Combobox | LATER |
| command-palette.tsx | focused command wrapper | Shortcut, escape and async record commands | Command | LATER |
| contact-form.tsx | complete host form | Busy, validation and refusal paths | Form | SKIP (already mature or shell-owned) |
| contextual-help.tsx | thin accessible wrapper | Tooltip label and focus boundary | Tooltip | SKIP (already mature or shell-owned) |
| data-table.tsx | feature-rich bespoke table | Sorting, filters, selection, virtual rows, columns; contract-heavy | Data Table | LATER |
| dates.ts | stable date helpers | Locale and calendar arithmetic edge cases | Calendar utilities | SKIP (already mature or shell-owned) |
| destructive-action.tsx | complete confirmation flow | Dialog labeling and async refusal | Alert Dialog | SKIP (already mature or shell-owned) |
| disclosure.tsx | tested tabs and panels | Tabs lacked orientation-aware keys; native details handles activation | Tabs / Accordion | MIGRATE-NOW |
| display.tsx | tokenized display set | Progress semantics and breadcrumb current page | Avatar / Badge / Progress | SKIP (already mature or shell-owned) |
| empty-state.tsx | simple content pattern | Caller supplies meaningful message | Empty state | SKIP (already mature or shell-owned) |
| field-context.ts | focused context contract | Carries label, hint and invalid associations | Form Field | SKIP (already mature or shell-owned) |
| field.tsx | accessible field composition | Hint/error IDs; accordion-backed sections | Form | SKIP (already mature or shell-owned) |
| form-controls.tsx | broad native controls | Labels, described-by, invalid; radio keyboard behavior covered | Checkbox / Radio Group / Switch | SKIP (already mature or shell-owned) |
| geometry.ts | narrow class helper | Width class parsing edge cases | None | SKIP (already mature or shell-owned) |
| index.ts | explicit public barrel | Export surface is catalog-tested | None | SKIP (already mature or shell-owned) |
| input.tsx | tokenized native fields | Native validation and disabled states | Input / Textarea | SKIP (already mature or shell-owned) |
| layout.tsx | product surface composition | Responsive layouts and semantic headings | Card / Alert | SKIP (already mature or shell-owned) |
| managed-form.tsx | lifecycle-heavy form | Dirty, submit, autosave and server feedback | Form | LATER |
| messages.ts | localization contracts | Caller-owned message completeness | None | SKIP (already mature or shell-owned) |
| modal-dialog.tsx | mature dialog workflows | Focus trap, return focus, escape, async prompt validation | Alert Dialog / Dialog | SKIP (already mature or shell-owned) |
| modal.tsx | Radix dialog adapter | Escape, focus and close semantics delegated upstream | Dialog | SKIP (already mature or shell-owned) |
| overlays.tsx | broad Radix adapters | Escape/outside/focus delegated; disabled item keyboard edge needed coverage | Dropdown Menu / Popover / Sheet | MIGRATE-NOW |
| pagination.tsx | tested compact pager | Current page and disabled navigation | Pagination | SKIP (already mature or shell-owned) |
| pending-button.tsx | focused pending action | Busy and disabled semantics | Button | SKIP (already mature or shell-owned) |
| record-detail.tsx | dialog composition | Pending and close semantics delegated | Dialog | SKIP (already mature or shell-owned) |
| repeater.tsx | functional list editor | Add/remove labels; index-based identity needs caller awareness | Form | LATER |
| select.tsx | native select wrapper | Native keyboard and form semantics; deliberately no custom listbox | Select | SKIP (already mature or shell-owned) |
| skeleton.tsx | complete loading shapes | Status wrapper versus decorative hidden variants | Skeleton | SKIP (already mature or shell-owned) |
| sortable-list.tsx | mature drag interaction | Keyboard drag, live announcements and viewport behavior | None | LATER |
| status-pill.tsx | focused status display | Tone contrast governed by theme tests | Badge | SKIP (already mature or shell-owned) |
| submit-button.tsx | focused submit state | Busy/disabled semantics | Button | SKIP (already mature or shell-owned) |
| table-actions.tsx | focused row actions | Icon-only labels and live selection feedback | Button Group | SKIP (already mature or shell-owned) |
| table.tsx | basic semantic table | Selection semantics; data behavior belongs elsewhere | Table | SKIP (already mature or shell-owned) |
| toast.tsx | themed notification card | Dismiss labeling and tone | Sonner | SKIP (already mature or shell-owned) |
| toasts.tsx | optional Sonner bridge | Optional peer and provider integration | Sonner | SKIP (already mature or shell-owned) |
| tone.ts | stable tone vocabulary | Constrained semantic values | None | SKIP (already mature or shell-owned) |
| tooltip.tsx | bespoke positioned tooltip | Escape, hover/focus and portal positioning | Tooltip | LATER |
| url-feedback.tsx | focused query feedback | Query-derived state and dismissal | Alert | SKIP (already mature or shell-owned) |
| use-admin-search-params.ts | framework adapter hook | URL boundary tested elsewhere | None | SKIP (already mature or shell-owned) |

This first slice migrates `disclosure.tsx` and `overlays.tsx`: both have direct interaction test suites, unlike the contract-heavy combobox, command palette, calendar and data table. Tabs now expose orientation and use the matching arrow keys with `aria-orientation`; overlays use the brand text token for focused menu entries and gain explicit disabled-item keyboard coverage. Their public exports remain unchanged; `AdminTabsProps` widens additively with optional `orientation` (default `horizontal`). The accordion and overlay prop surfaces are unchanged. Later streams should address the deferred bespoke and contract-heavy controls without changing their contracts in this slice.
