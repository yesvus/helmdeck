# Helmdeck Payload starter

A copyable Payload CMS starter with a Helmdeck admin shell, Payload-owned users and products, and
access-checked content persistence. Payload owns the content schema and editor; Helmdeck provides
the shell, session primitives, and Payload bridge.

## Setup

From a checkout of the default branch, scaffold a project:

```sh
node path/to/helmdeck/scripts/create-admin-app.mjs my-admin
cd my-admin
npm install
npm run dev
```

Open <http://localhost:3000/payload/admin> to create the first Payload account, then sign in to the
Helmdeck shell at <http://localhost:3000/admin>. The scaffold pins the published Helmdeck tarball
and writes `HELMDECK_SESSION_SECRET` and `PAYLOAD_SECRET` to the ignored `.env.local` file. The
session secret is 64 random bytes encoded as hex. Payload's secret is 32 random bytes encoded as
base64url. Keep each value consistent across instances.

When running the template directly from a checkout, create both secrets yourself:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" # HELMDECK_SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" # PAYLOAD_SECRET
```

Save the first value as `HELMDECK_SESSION_SECRET` and the second as `PAYLOAD_SECRET` in `.env.local`.

Payload uses `./payload.db` by default. Set `PAYLOAD_DATABASE_URL` to select another SQLite or
libSQL database, and set `PAYLOAD_DATABASE_TOKEN` when the remote libSQL database requires
authentication. Schema push is deliberately enabled in every environment in this starter so a fresh
production database can start without generated migrations. Review this behavior before pointing it
at a shared database, since startup can change its schema.

## Tailwind CSS

`app/(helmdeck)/globals.css` scans Helmdeck's compiled components and imports its theme tokens:

```css
@import "tailwindcss";
@source "../../node_modules/@yesvus/helmdeck/dist";
@import "@yesvus/helmdeck/theme.css";
```

Keep the theme import in this stylesheet so Tailwind processes its theme directives.

## What is where

- `payload.config.ts`: Payload collections, admin route, and database configuration.
- `lib/payload-access.ts`: collection access rules.
- `lib/session.ts`: baseline signed-cookie adapter, Payload login, session resolution, and Payload auth strategy.
- `lib/persistence.ts`: Payload content and persistence bridge.
- `lib/rules.ts`: Helmdeck shell permission decision.
- `proxy.ts`: redirects unauthenticated visitors to sign in.

## The one rule

The Helmdeck shell asks `lib/rules.ts`. Payload collection access functions in
`lib/payload-access.ts` enforce content reads and writes. The Payload admin uses the same session
through `createAdminPayloadAuthStrategy`. Keep Local API reads and writes behind
`createAdminPayloadContent`, which passes `overrideAccess: false` and the session's user.

## What you still have to add

1. **A way to reset a forgotten password.** Payload owns password reset tokens; configure delivery
   for your deployment.
2. **A media adapter.** Upload, listing, signed URLs, retention and media mutations are yours.
   `AdminMediaAdapter` is the contract; storage behind it is host-owned.
3. **An audit trail and a cache invalidator.** Add Payload hooks and cache revalidation appropriate
   to your deployment.
4. **A rule that reads the record.** Add row-level conditions to Payload access functions when
   records require them.
5. **A second interface language.** Register another Helmdeck message dictionary if required.
6. **A contact form endpoint.** Validate, rate-limit, store, or email submissions in your app.

Payload's first-user flow creates the initial account. The database starts empty.

## Checks

```sh
npm run typecheck
```
