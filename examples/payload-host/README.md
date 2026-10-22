# Payload host

A Next.js App Router admin with Payload as the CMS under it, and the six steps that put Payload
under Helmdeck already done: one database, one session, one rule, one call site, one look, and a
shell whose own pages read the CMS's records.

It is a reference, not a product. The interface itself is in the package: the shell, the table, the
stat cards, the empty state, the theme, and the English and Turkish wording. What this directory
holds is the arrangement: the files that decide where the records live, who may see them, and how
the two surfaces share a session. The decisions a host still has to make are in
[What you still have to add](#what-you-still-have-to-add), one by one.

## Setup

```sh
npm install
```

In this repository the package is the working tree, declared as `file:../..`, so the install links
it and the package has to be built for it to resolve at all (`pnpm build` in the repository root).
A copy declares the published version instead, which carries its own build.

Two secrets, both required, both read from the environment:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # HELMDECK_SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # PAYLOAD_SECRET
```

Put them in `.env.local`. `HELMDECK_SESSION_SECRET` signs this host's session cookie and
`PAYLOAD_SECRET` signs Payload's own tokens; a secret held in a repository is not a secret, and a
per-process random signs every instance differently, so every visitor would read as signed out.

Then:

```sh
npm run dev
```

Open <http://localhost:3000>. The database is `./payload.db`, created on the first request, and
`PAYLOAD_DATABASE_URL` overrides it: a `libsql://` URL with `PAYLOAD_DATABASE_TOKEN` beside it is a
hosted database, so growing into one is two environment variables rather than a rewrite. A host on
Postgres swaps the adapter in `lib/payload/db.ts` for Payload's Postgres one and points the same
environment variable at it.

**The first account is created in Payload's own panel.** With no accounts in the collection, Payload
offers its first-user route at `/payload/create-first-user`. Give it an address and a password: the
first account becomes an administrator, because there is nobody else to make one. Every account
after that is an `Editor` unless an administrator says otherwise, and only an administrator can
create one at all.

The sign-in is this host's own form at `/login`, and Payload's panel is pointed at it, so there is
one place where a password is typed.

**A deployment names its own origin.** `PAYLOAD_SERVER_URL` is the origin the browser used, and it
is what Payload's CSRF allowlist and its generated links are built from. A deployment behind a
custom domain sets it; a Vercel deployment is answered from `VERCEL_URL` without it.

## The six steps

| Step | Where it is |
| --- | --- |
| **One database.** Payload's adapter and this host's reads point at the same libsql URL. | `lib/payload/db.ts` |
| **One session.** Payload's auth strategy resolves this host's session cookie, so there is one sign-in and one sign-out. | `lib/session.ts`, `lib/payload/auth-strategy.ts` |
| **One rule.** Payload's access functions are the rule, and the shell's permission adapter delegates to them. | `lib/rules.ts`, `lib/payload/access.ts`, `lib/permissions.ts` |
| **One call site.** Every server read and write into Payload goes through one module that always passes `overrideAccess: false` and a user. | `lib/payload/content.ts` |
| **One look.** Payload's panel is themed with Helmdeck's tokens, in its own route group beside the shell. | `lib/payload/theme.ts`, `app/(payload)/payload.css` |
| **The shell's own surfaces read Payload**, so the dashboard and the list show the records the CMS holds. | `app/(helmdeck)/admin/page.tsx`, `app/(helmdeck)/admin/pages/page.tsx` |

Two of them are worth reading closely, because they are the ones that go wrong quietly.

**The one call site.** Payload's Local API skips every access control unless it is told otherwise:
`overrideAccess` defaults to `true`, and there is no error, no warning and no log line for the
omission. The package's bridge passes `overrideAccess: false` and the session's user on every call,
and a request with no session is refused before it reaches Payload. The defence is that there is one
module that makes the call, so a call site that remembered one of the two cannot be written by
accident. `lib/payload/content.ts` is that module, and the dashboard and the list read through it.

**The one rule.** `lib/rules.ts` is the only place a permission is decided. Payload's access
functions ask it, and the shell's permission adapter asks it through the package's bridge, over the
same session, so a link that renders and an operation that is refused cannot come to disagree about
the same account. The role is read from the account row rather than from anything a request sent.

## What is where

| File | What it is |
| --- | --- |
| `payload.config.ts` | Payload's config: the editor, the collections, the database, the panel's route, the CSRF allowlist and the one language. |
| `lib/rules.ts` | **The one rule.** Every authorization decision in this host, and nothing else decides one. |
| `lib/session.ts` | The session: the sign-in, the cookie, and the account behind it. |
| `lib/permissions.ts` | The permission names, and the adapter the shell mounts. |
| `lib/payload/content.ts` | **The one call site.** The only path from this host's server code into Payload's data. |
| `lib/payload/access.ts` | The rule asked the two ways Payload and the shell ask it. |
| `lib/payload/auth-strategy.ts` | How Payload's panel learns who is signed in. |
| `lib/payload/collections.ts` | The accounts and the content. |
| `lib/payload/theme.ts` | How the panel is made to read as this host's. |
| `app/(helmdeck)/` | This host's own document: the shell, the dashboard, the list, the sign-in. |
| `app/(payload)/` | Payload's own document: the panel, its API and its stylesheet. |
| `components/` | The shell's client halves and the panel's three custom components. |

## The decisions this host makes for you

Four of them are worth stating here rather than leaving in the code.

**The accounts live in Payload.** The demo keeps its accounts in its own tables, which is why the
demo turns Payload's local strategy off: Payload's own login would keep a hash in its own format
beside the demo's, so one table would hold two answers about who may sign in. Here the accounts are
Payload's `users` collection and nothing else, so there is one credential store, Payload's local
strategy stays on, and this host asks Payload's own login operation to check a password rather than
holding a hash of its own. What is switched off is the response: `removeTokenFromResponses` means
Payload's REST login endpoint verifies a password and hands back nothing that could be used, so the
form at `/login` is the only way in. Payload's own lockout is on for the same reason: that endpoint
is where an unbounded guess would otherwise go.

**The session is stateless.** The cookie carries the account's id, signed, so a browser cannot invent
one, and every request reads the account again to learn what it may do. The cost is real and is
stated rather than hidden: a sign-out ends the browser's copy of the session and cannot end a copy
somebody else kept. A host that needs a sign-out to be revocable everywhere keeps session rows
(`lib/session.ts` is where they go) and ends them in the sign-out action. Payload's panel also has a
logout button of its own, which ends Payload's session rather than this host's; the sign-out beside
the panel's link back into the shell is the one that ends this host's session.

**The panel is mounted at `/payload`.** The shell owns `/admin`, as the starter template does, so
the panel is mounted beside it with one line in `payload.config.ts`. Payload's admin panel renders
its own `html` tag, so it lives in a route group of its own with a root layout of its own: two
documents, one session, and a browser that holds the same cookie for both.

**The accounts are the host's own business.** Only an administrator may create, change or delete one,
because an account is a role and writing one is writing a permission. The content rule grants
editors `create` and `update`, which is right for content and wrong for accounts.

## What you still have to add

The host stops where your project's decisions start. Each item below is absent on purpose, and each
is one you have to make rather than one you have to find later.

1. **A schema you can deploy.** Development pushes the schema to match the config, so a change to a
   collection is one restart away. Nothing else does: `push` alters whatever database it is pointed
   at. Generate Payload's migrations (`npx payload migrate:create`) in development, commit them with
   this directory, and run them (`npx payload migrate`) against the deployment's database. The
   procedure is in `payload-migrations/README.md`.
2. **A way to reset a forgotten password.** Payload's own forgot-password route is present because
   its local strategy is on, and it needs an email adapter to do anything. Nothing in the package can
   send mail, and a deployment that leaves it unset answers that route with an error.
3. **A second interface language.** `app/(helmdeck)/layout.tsx` says `locale="en"` and nothing else.
   The package ships English and Turkish dictionaries; registering your own is `defineAdminMessages`,
   and content language is a separate concern the package keeps out of its URLs unless you map it.
4. **A rule that reads the record.** The rule decides from the role and the operation alone, so a
   question about a record is refused rather than answered as though it were about the role. A rule
   that withholds one record decides it in `lib/rules.ts` and is enforced on both sides with nothing
   else changed, and it needs an adapter that carries the record: `lib/permissions.ts` is where the
   host's own adapter goes when the package's bridge is not enough.
5. **A media adapter.** Upload, listing, signed URLs, retention and media mutations are yours.
   Payload's own uploads are the CMS's answer to it, and this host does not mount them yet.
6. **An audit trail.** A record of who wrote what is a host decision: where the trail goes, and what
   a stale read is keyed on. The package's own activity surface reads a store you provide.
7. **A throttle that outlives the process.** The sign-in's own throttle counts failed attempts in
   the process that saw them, so a deployment with several instances spreads a guess across them.
   Payload's lockout on the account is the shared half; a host that wants a per-client bound across
   instances puts a shared `AdminLoginThrottle` in `lib/session.ts`.
8. **A second door, deliberately closed.** Payload's REST login endpoint verifies a password and
   returns nothing, and the accounts collection refuses every write that is not an administrator's.
   A host that wants to invite people, or to let an editor manage accounts, changes
   `lib/payload/collections.ts` and says so here.

Also absent, and deliberately so: any records. The collection arrives empty, which is what makes the
first page you write in Payload's editor the way you find out the panel works.

## Checks

```sh
npm run typecheck
```

In this repository, `pnpm typecheck:payload-host` runs the same compiler over this directory after
linking the package into `examples/payload-host/node_modules`, which is what keeps a host nobody
compiles from being copied stale.
