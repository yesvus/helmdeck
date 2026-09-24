# Decisions

- Package name and scope: `@yesvus/helmdeck`.
- Distribution: consumable artifacts are GitHub prerelease tarballs containing the built `dist/` output. npm publication is postponed indefinitely.
- The package ships a styled Tailwind v4 interface with semantic brand and layout tokens in `src/theme/tokens.css`.
- Host applications own authentication, authorization, persistence, routes, API handlers, and content-editing locale state.
- Helmdeck UI language is independent from content-editing language. English and Turkish dictionaries are built in, and `defineAdminMessages` supports additional locales.
- Media operations use the `AdminMediaAdapter` contract. The package does not select a database, object store, or upload endpoint.
- The fixture app is the public product demo and consumes the package through its public export.

## Source arbitration

When a host has a mature implementation, preserve its behavior through a thin adapter while moving generic UI structure into the package. Domain labels, data rules, and infrastructure remain with the host.
