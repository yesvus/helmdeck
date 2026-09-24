# Helmdeck extraction plan

## Purpose

Helmdeck is the reusable admin interface layer for Next.js App Router applications. It standardizes the shell, interaction primitives, localization, and media workflows while host applications retain their own domain model and infrastructure.

## Package boundary

### Included

- Responsive shell: sidebar, topbar, mobile navigation, breadcrumbs, command search, profile actions, and login presentation.
- UI primitives: buttons, fields, inputs, selects, forms, pending states, feedback, tables, pagination, modals, skeletons, status pills, sortable lists, and destructive confirmations.
- Adapter contracts for sessions, navigation, authentication, and media.
- Typed message dictionaries, built-in English and Turkish copy, and a registration API for additional locales.
- Theme tokens and bilingual fixture routes.

### Host-owned

- Authentication providers, session resolution, authorization, and route protection.
- Databases, content models, storage providers, API routes, and domain operations.
- Content-editing locale state and translations.
- Application-specific labels, validation rules, and business workflows.

## Integration contract

Each host keeps a thin panel layout that resolves its session, filters navigation, and supplies the active UI dictionary. Media operations are implemented behind `AdminMediaAdapter`, so the package never assumes a database, object store, or upload endpoint.

The active content-editing language remains a host concern. A host can use a separate query key, cookie, or preference for Helmdeck UI language without coupling the two states.

## Delivery phases

1. Establish the package, theme, shell, and navigation configuration.
2. Extract the reusable form, feedback, data, and destructive-action primitives.
3. Add typed localization and formal Turkish defaults, with English as a built-in alternative.
4. Add media adapter contracts and reusable upload, picker, and field workflows.
5. Validate a host application against the packed package.
6. Publish a prerelease and deploy the bilingual fixture app.

## Release gates

- Package typecheck, lint, unit tests, and production build pass.
- Fixture typecheck, lint, tests, and production build pass.
- A host installs the packed artifact and passes its typecheck, lint, tests, and build.
- The fixture app is reachable at the configured domain.
