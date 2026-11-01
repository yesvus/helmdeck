import type { ReactNode } from "react";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdminSession } from "@/lib/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { payloadInstance } from "@/lib/payload/content";
import { readPayloadSession } from "@/lib/session";
import { readPayloadSiteSettings } from "@/lib/payload/settings";

/**
 * The sidebar, and the one page every other one is a child of.
 *
 * Each item names the permission that decides whether it is shown, and the permission name carries
 * its operation: `pages:read` asks about a read. The item is still only a link: the page behind it
 * and the writes it reaches are both refused by the same rule, and hiding a link is not what makes
 * either of them safe.
 */
const nav: AdminNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/admin", label: "Overview", icon: "overview" },
      {
        href: "/admin/pages",
        label: "Pages",
        icon: "article",
        permission: PERMISSIONS.pagesRead,
      },
      {
        href: "/admin/media",
        label: "Media",
        icon: "article",
        permission: PERMISSIONS.mediaRead,
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: "overview",
        permission: PERMISSIONS.settingsRead,
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

  let siteName: string | undefined;
  try {
    const payload = await payloadInstance();
    const settings = (await readPayloadSiteSettings(payload, readPayloadSession)) as { name?: unknown } | null;
    if (settings && typeof settings.name === "string" && settings.name) siteName = settings.name;
  } catch {
    siteName = undefined;
  }

  return (
    <AdminFrame nav={nav} session={session} siteName={siteName}>
      <div className="p-6 lg:p-10">{children}</div>
    </AdminFrame>
  );
}
