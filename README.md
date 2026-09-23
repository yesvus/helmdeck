# helmdeck

A reusable, MIT-licensed admin shell for Next.js App Router projects, extracted
from the admin panels of Birted Commerce and Leotron.

Status: phase 1 shell layout ported. Extraction plan in [plan.md](./plan.md),
roadmaps, decisions and per-phase checklists in [docs/](./docs/).

## Layout

```
src/
  index.ts
  shell/        AdminShell, AdminNavLink, AdminMobileNav, AdminBreadcrumbs,
                AdminSearch, AdminProfileMenu, AdminLoginScreen
  primitives/   button, field, input, select, submit, toast, status pill,
                empty state, skeleton, table, pagination, modal,
                destructive action, sortable list
  adapters/     AdminSession, AdminNavGroup, role filtering
  theme/        brand tokens, useAdminBranding
fixtures/       story page per shell and primitive
```

Import the token file once in the host app CSS:

```css
@import "tailwindcss";
@import "@yesvus/helmdeck/theme.css";
```

## Development

- `pnpm install`
- `pnpm dev` - fixture stories on http://localhost:3000
- `pnpm typecheck` - package plus fixtures
- `pnpm build:fixtures` - production build of the fixture app
