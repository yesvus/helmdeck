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
- `pnpm build` - compile the package to `dist`
- `pnpm typecheck` - package plus fixtures
- `pnpm lint` - ESLint over source and fixtures
- `pnpm build:fixtures` - production build of the fixture app

## Usage

Every host keeps a thin panel layout that resolves its own session and passes
navigation config in:

```tsx
// app/(panel)/layout.tsx
import type { ReactNode } from "react";
import { AdminShell, type AdminNavGroup, type AdminSession } from "@yesvus/helmdeck";

const nav: AdminNavGroup[] = [
  {
    label: "Content",
    items: [
      { href: "/admin", label: "Dashboard", icon: "overview", mobilePrimary: true },
      { href: "/admin/products", label: "Products", icon: "product", roles: ["admin"] },
    ],
  },
];

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = (await getSession()) as AdminSession;

  return (
    <AdminShell nav={nav} session={session} homeHref="/admin" onLogout={signOut}>
      {children}
    </AdminShell>
  );
}
```

Role filtering, breadcrumb trails and search all read from that `nav` config.
The full integration contract lives in [plan.md](./plan.md).
