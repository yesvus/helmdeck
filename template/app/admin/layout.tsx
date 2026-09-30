import type { ReactNode } from "react";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { AdminFrame } from "@/components/admin-frame";
import { productsResource } from "@/lib/resources";
import { requireAdminSession } from "@/lib/session";

/**
 * The sidebar, and the one page every other one is a child of.
 *
 * Each item names the permission that decides whether it is shown, taken from the definition rather
 * than written as a string, so a permission renamed in `lib/resources.ts` cannot leave a sidebar
 * entry pointing at a name nothing decides. The item is still only a link: the page behind it and
 * the actions it reaches are both refused by the same rule, and hiding a link is not what makes
 * either of them safe.
 */
const nav: AdminNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/admin", label: "Overview", icon: "overview" },
      {
        href: "/admin/products",
        label: productsResource.label,
        icon: "product",
        permission: productsResource.permissions?.read,
      },
    ],
  },
];

/**
 * The shell, on a server component, so the session it renders is the real one.
 *
 * The guard runs before anything renders. A layout cannot read the path it is rendering, so the
 * `returnTo` below is this segment's root; `proxy.ts` carries the page the visitor actually asked
 * for, and a visitor with no cookie at all never reaches here.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession({ returnTo: "/admin" });

  return (
    <AdminFrame nav={nav} session={session}>
      <div className="p-6 lg:p-10">{children}</div>
    </AdminFrame>
  );
}
