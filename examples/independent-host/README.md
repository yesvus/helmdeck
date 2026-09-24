# Independent host example

This small Next.js App Router host uses Helmdeck exclusively through `@yesvus/helmdeck` public exports. The sample has no backend: its session is host-resolved, persistence is an in-memory host adapter, and media upload returns a browser-local object URL. Replace these seams with the host's auth, data, and storage services for a deployed application.

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

- `components/admin-workspace.tsx` configures `AdminShell` navigation, branding, session input, logout callback, and the `AdminI18nProvider` interface locale. The example intentionally sets English independently from stored or content locale.
- `host/session.ts` is the host-owned session resolution seam. Resolve a real session there and enforce access in host route handlers and server actions. Shell role filtering is presentation only.
- `host/persistence.ts` implements the public `AdminPersistenceAdapter` contract over process-local memory. `host/actions.ts` demonstrates a server action validating input, writing through that seam, and revalidating the host route.
- `host/media.ts` implements `AdminMediaAdapter`. Listing and upload are deliberately local stand-ins. Configure real listing, storage, signed URLs, and mutations in the host adapter, then pass it to `AdminMediaUpload`.
- `app/globals.css` imports the package theme tokens alongside Tailwind.

The host defines its own resource names, schemas, routes, authorization policy, storage, locale policy, and cache strategy. Interface copy comes from Helmdeck's English dictionary; identity and persistence behavior remain host-owned.

## Checks

```sh
pnpm typecheck
pnpm build
```
