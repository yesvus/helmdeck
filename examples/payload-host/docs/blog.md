# Blog starter

The Payload host includes an optional editorial starter: Payload's Lexical editor, `posts` and
`categories`, published article pages, and an administrator post list.

## Setup and use

The collections register with the existing Payload config. Create categories and posts at
`/payload/collections/categories` and `/payload/collections/posts`. Posts begin as drafts. Set
status to `published` and provide a publication date to make one visible at `/blog`.
Authors use the existing `users` collection, and hero media uses the existing `media` collection.

Authenticated administrators can preview a draft at `/blog/<slug>?draft=1`. The server resolves the
host session and denies that read to non-administrators. Published routes query only published
posts. Local API calls pass `overrideAccess: false`; public visitors receive no user, while preview
uses the authenticated Payload user.

## Customize or disable

The public route defaults to `/blog`. Set `HELMDECK_BLOG_PATH` to the desired path and update the
two filesystem route segments under `app/(helmdeck)/blog` to match it, since Next.js App Router route
segments are filesystem-defined. Set `HELMDECK_BLOG_PATH` to an empty string to disable the built-in
pages; `blogRouteMatches` returns false for every path when disabled. The filesystem route remains,
but its pages return not-found.

Adjust the article presentation in `app/(helmdeck)/blog`, and the content schema in
`lib/payload/posts.ts` and `lib/payload/categories.ts`. Generate and commit a Payload migration for
production deployments using the existing [migration guidance](../payload-migrations/README.md).
