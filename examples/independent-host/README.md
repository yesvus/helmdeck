# Independent host example

This small Next.js App Router host uses Helmdeck through `@yesvus/helmdeck` public exports. Its auth session uses Helmdeck's signed-cookie baseline adapter, persistence uses the public SQLite adapter with a local file, and media upload returns a placeholder URL. The local database demonstrates the persistence contract across process restarts; replace these seams with shared host services for a deployed application.

## Setup

From the Helmdeck repository root, build the package and install the example dependencies:

```sh
pnpm install --frozen-lockfile
pnpm build
cd examples/independent-host
pnpm install
pnpm dev
```

Open <http://localhost:3000>. `/` redirects to `/admin`.

## Configuration and integration seams

- `app/layout.tsx` applies the exported pre-paint theme script and wraps the app in `AdminThemeProvider`; `components/admin-workspace.tsx` places `AdminThemePreference` in the shell top bar. Theme selection is stored locally and supports light, dark, and system modes.
- `components/admin-host-auth-provider.tsx` adapts host server actions to `AdminAuthAdapter` and wraps the app in `AdminAuthProvider`. The admin layout uses `AdminRequireSession` for client state and validates the session on the server before rendering protected routes. The proxy checks cookie presence only, redirects cookie-less visitors with their deep link, and forwards the requested path so the layout preserves it when rejecting an expired or invalid session.
- `host/session.ts` configures the baseline `createSessionAuthAdapter` with sample credentials (`editor@example.test` / `helmdeck-demo`), a host-local SQLite session registry, and a process-local login throttle. The sample credentials are accepted only outside production. Generate `INDEPENDENT_HOST_SESSION_SECRET` with `generateSessionSecret()` and keep it stable across instances. Before enabling sign-in in production or across multiple instances, replace the demonstration verification and session registry with the host's identity system and shared store, and replace the throttle with a shared limiter. Host layouts and actions enforce access; shell role filtering is presentation only.
- `/admin/profile` mounts `AdminProfilePage` with the resolved session and sign-out action.
- `host/persistence.ts` implements the public `AdminPersistenceAdapter` contract over `.data/independent-host-data.sqlite`, seeded once on first use. The database sits outside Next.js build output so a rebuild does not clear it. Set `INDEPENDENT_HOST_DATA_DB` to choose another local database path. `host/actions.ts` demonstrates a server action validating input, writing through that seam, and revalidating the host route.
- `/admin/projects` and `/admin/orders` use host-defined resource declarations with the package's generated lists and forms; the client adapter calls host server actions, which authorize and validate access to the host's persistence.
- `/admin/dashboard` registers shipped stat widgets and renders them through `AdminDashboardLayout` with host-resolved data.
- `host/media.ts` implements `AdminMediaAdapter`. Listing and upload are deliberately local stand-ins. Configure real listing, storage, signed URLs, and mutations in the host adapter, then pass it to `AdminMediaUpload`.
- `/admin/blocks` registers hero and quote block types with host-owned fields and validation, edits them through `AdminCollectionEditor`, and serializes stable IDs through `adminCollectionFormData` before the host action stores them. `/blocks-preview` reads those saved values through the host renderer and displays each saved English heading, falling back to the generic heading. The editor preview uses the content locale when the host provides one, otherwise its interface locale; this example uses English. The example also demonstrates the existing media field.
- `app/globals.css` imports the package theme tokens alongside Tailwind.

The host defines its own resource names, schemas, routes, authorization policy, storage, locale policy, and cache strategy. Interface copy comes from Helmdeck's English dictionary; identity and persistence behavior remain host-owned.

The `link:../..` dependency is a repository-local development shortcut that resolves the built package through its public exports. It resolves the working tree, so it cannot tell you whether a *published* release is consumable.

To check a release as a host would, take the version from the repository root and install the published artifact, verifying the checksum the way the root README tells consumers to:

```sh
VERSION=$(cat ../../VERSION)                       # e.g. v0.4.0
BASE=https://github.com/yesvus/helmdeck/releases/download/$VERSION
cd "$(mktemp -d)"
curl -sSLO "$BASE/yesvus-helmdeck-${VERSION#v}.tgz"
curl -sSLO "$BASE/yesvus-helmdeck-${VERSION#v}.tgz.sha256"
sha256sum -c "yesvus-helmdeck-${VERSION#v}.tgz.sha256"
cd - >/dev/null
pnpm add "$BASE/yesvus-helmdeck-${VERSION#v}.tgz"
pnpm typecheck
pnpm build
```

Confirm it resolved the release rather than the link before trusting the result:

```sh
node -p "require('./node_modules/@yesvus/helmdeck/package.json').version"
```

Then restore the development shortcut with `git checkout -- package.json pnpm-lock.yaml`.

For a pre-release check that has not been published, `pnpm pack --pack-destination` from the repository root produces an equivalent tarball locally.

## Checks

```sh
pnpm typecheck
pnpm build
```
