# Helmdeck starter

A Next.js App Router admin you can run before you have written any of it: a sign-in that checks a
password against a stored hash, a resource whose list searches, sorts, filters and pages, a form
generated from the same description, and a shell around both. There is no database to set up, no
schema to design, and no second place where a permission is decided.

## Setup

From a checkout of the Helmdeck repository's default branch, one command writes a project from this
directory. A checkout of a release tag may predate the command, so clone the branch and pass
`--version` if you want to pin an earlier release:

```sh
node path/to/helmdeck/scripts/create-admin-app.mjs my-admin
```

That copies these files, rewrites the manifest to pin `@yesvus/helmdeck` to a published release
tarball rather than to a path in a neighbouring checkout, and mints the session secret into a
`.env.local` the copied `.gitignore` already ignores. It reaches no network; the install is where the
pinned URL is used. Run `node path/to/helmdeck/scripts/create-admin-app.mjs --help` for the options,
which include `--install` and a `--version` for a release other than the checkout's own.

Then, in the directory it wrote:

```sh
cd my-admin
node scripts/create-user.mjs you@example.com admin
npm run dev
```

Open <http://localhost:3000>, which redirects to `/admin` and then to the sign-in page.

Reading this file in a checkout instead? The two commands above run from here, and the manifest's
`link:..` resolves in this repository only:

```sh
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # into .env.local as HELMDECK_SESSION_SECRET
node scripts/create-user.mjs you@example.com admin
npm run dev
```

`create-user.mjs` asks for the password and does not echo it. Pass a role as the second argument; the
roles are the keys of `ROLE_OPERATIONS` in `lib/rules.ts`, and an account holding a role that map does
not define can sign in and may do nothing at all. `npm run create-user` is the same command.

`HELMDECK_SESSION_SECRET` has no default on purpose. Without it the app refuses to load and says so,
because a secret held in a repository is not a secret, and a per-process random signs every instance
differently so every visitor would read as signed out.

One note on the manifest, because a template is copied rather than read: the package's peer
dependencies are declared here rather than left to be installed transitively. They are the reason the
shell lays out, because its components are written with Tailwind utilities.

The database is `./helmdeck.db`, created on the first query, and nothing has to be configured for
that. `HELMDECK_DATABASE_URL` overrides it, and a `libsql://` URL with `HELMDECK_DATABASE_TOKEN` beside
it is a hosted database, so growing into one is two environment variables rather than a rewrite.

## What is where

| File | What it is |
| --- | --- |
| `lib/rules.ts` | **The one rule.** Every authorization decision in this app, and nothing else decides one. |
| `lib/session.ts` | The credential store's sign-in, the session read, and the guard a page calls. |
| `lib/persistence.ts` | The SQLite store, and where the accounts and sessions live in it. |
| `lib/store.ts` | The write boundary: one guard, one exposed set, writes narrowed to declared fields. |
| `lib/resources.ts` | The resource descriptions. The permission names live here, once. |
| `app/actions/` | The three `"use server"` files that carry the seams across to the browser. |
| `components/` | The client halves: the frame, the adapter the generated views read through, the form. |
| `proxy.ts` | Where the redirect for a visitor with no session is built, because only it knows the path. |
| `scripts/create-user.mjs` | How an account is made. Run it by hand; it is not a route. |

## The one rule

`lib/rules.ts` holds the only function in this project that answers "may this session do this", and
the package asks it from both sides of the browser: `checkPermission` for what the sidebar, the
generated list and the generated form render, and `requirePermission` for what the server actions
that reach the store serve. Both are built from the same `can`, over the same session the server
resolved, so a button cannot appear and then fail, and a hidden button is not what makes it safe.

Three things are deliberately arranged so that a second rule is hard to write by accident:

- The permission names live in `lib/resources.ts`, once, and the guard derives the name it asks about
  from a resource and an operation. Adding a resource cannot add a permission nothing decides.
- The exposed set is built from those same definitions rather than listed again, so a resource cannot
  be reachable through the store and invisible to the rule.
- The accounts and the sessions are in the store and not in any definition, which is what keeps a
  password hash out of a table browser that exists for everything else. That is a property of what is
  absent, not of a rule someone has to remember.

The rule reads the role and nothing else, so it answers the same for every product whatever the
product is. A rule that withholds one record decides that in `can` and is enforced on both sides
with no change to anything else.

**Replace the contents of `lib/rules.ts`. Do not add a check beside it.** Two functions answering
the same question is how the two halves come to disagree, and the disagreement only shows up as a
control that renders and then fails.

## What you still have to add

The template stops where your project's decisions start. Each item below is absent on purpose, and
each is one you have to make rather than one you have to find later.

1. **A way to create an account.** The only thing that writes a `users` row is
   `scripts/create-user.mjs`, which a person runs from a terminal. That is enough to sign in and
   nothing else: no registration route, because an unauthenticated write path is something you would
   have to remember to close, and an account-invite flow is your product's, not this template's.
2. **A way to reset a forgotten password.** Nothing in the package can send mail, and `AdminSession`
   carries no timestamp and no recovery token, so an account whose password is forgotten is reset by
   a person with a shell. The sign-in answers an unknown address in the same message and the same time
   as a wrong password, so whatever you write on top of that envelope can stay honest.
3. **A settings page.** `AdminShell` points its settings entry at `${homeHref}/settings`, and the
   template does not mount one, so pass `settingsHref` to `AdminProfilePage` once you have a page to
   point at. The account page itself is mounted, and it renders only the controls it can honour.
4. **A media adapter.** Upload, listing, signed URLs, retention and media mutations are yours.
   `AdminMediaAdapter` is the contract and the upload, picker, gallery and placeholder components are
   the package's; the storage behind them is not, and a stub that was copied is a stub that stayed.
5. **An audit trail and a cache invalidator.** `createAdminResourceActions` takes both and calls them
   after a write that reached the store. The template passes neither, because both of their shapes
   are host decisions: where a trail goes, and what a stale read is keyed on. A `console.log` sink or
   a no-op invalidator left behind is a trail going nowhere or a list that never refreshes, and both
   fail silently.
6. **A rule that reads the record.** `can` decides from the role and the operation alone. A rule that
   withholds one record, or one row, decides it in `can` and gets the record's id in the third
   argument, enforced on both sides of the admin with nothing else changed.
7. **A second interface language.** `app/layout.tsx` says `locale="en"` and nothing else. The package
   ships English and Turkish dictionaries; registering your own is `defineAdminMessages`, and content
   language is a separate concern the package keeps out of its URLs unless you map it.

Also absent, and deliberately so: any records. The store arrives empty, which is what makes the
first row you create through the form the way you find out the form works.

## What the template does not decide for you

- **Where sessions live.** The sign-in is a signed cookie over a row, chosen because it needs nothing
  installed. A host with a token in a header, a row keyed by a device or a session store of its own
  implements `AdminAuthAdapter` and passes it instead; the shell has no opinion.
- **Whether the session is revocable everywhere.** `createCredentialAuthAdapter` can end every session
  the calling account holds, and refuses the capability unless you pass `mayEndAllSessions`. The
  template omits it, so the account page renders no control for it. The decision needs a role, and the
  package has no vocabulary for roles, so it is yours to make in that one option.
- **How a read is scoped to the caller.** A list shows what the query returned. Narrowing rows to the
  ones a session may see is a condition inside the query, because a rule asked once per returned row
  would be a second row filter that cannot compose with your own.
- **Column formats the package does not print.** `money` and `count` are names it ships. Anything else
  is a name you register in `AdminResourceList`'s `formatters` prop, because a definition reaches a
  client component as data and a function in it cannot travel.

## Checks

```sh
npm run typecheck
```

In this repository, `pnpm typecheck:template` runs the same compiler over this directory after
linking the package into `template/node_modules`, which is what keeps a template nobody compiles from
being copied stale.
