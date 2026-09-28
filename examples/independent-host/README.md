# Independent host example

This small Next.js App Router host uses Helmdeck exclusively through `@yesvus/helmdeck` public exports. The sample has no backend: its session is host-resolved, persistence is an in-memory host adapter, and media upload returns a placeholder URL. Replace these seams with the host's auth, data, and storage services for a deployed application.

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

- `components/admin-workspace.tsx` configures `AdminShell` navigation, branding, session input, and the `AdminI18nProvider` interface locale. The example intentionally sets English independently from stored or content locale. The static sample omits a logout callback.
- `host/session.ts` is the host-owned session resolution seam. Resolve a real session there and enforce access in host route handlers and server actions. Shell role filtering is presentation only.
- `host/persistence.ts` implements the public `AdminPersistenceAdapter` contract over process-local memory. `host/actions.ts` demonstrates a server action validating input, writing through that seam, and revalidating the host route.
- `host/media.ts` implements `AdminMediaAdapter`. Listing and upload are deliberately local stand-ins. Configure real listing, storage, signed URLs, and mutations in the host adapter, then pass it to `AdminMediaUpload`.
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
