# Roadmap

The package is now organized around a stable host boundary: Helmdeck owns reusable shell, primitives, localization, and media workflows; each host owns its data, authentication, routes, and domain language state.

## Completed

- Package scaffold, theme tokens, build, lint, and test tooling.
- Responsive shell with navigation, mobile navigation, breadcrumbs, search, profile actions, and login presentation.
- Form, feedback, data, modal, destructive-action, and sortable-list primitives.
- Typed English and Turkish dictionaries with formal Turkish defaults and custom dictionary registration.
- Media adapter contract with upload, picker, single-value fields, gallery fields, and locale-aware labels.
- Bilingual fixture routes covering the shell, forms, media, primitives, and login presentation.
- Host integration validation against a packed artifact.

## Next

- Publish and consume the first prerelease.
- Deploy the fixture app and verify the custom domain.
- Add dark theme support through semantic tokens and a host-compatible activation strategy.
