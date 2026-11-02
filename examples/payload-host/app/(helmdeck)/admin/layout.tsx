import type { ReactNode } from "react";
import type { AdminNavGroup } from "@yesvus/helmdeck";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdminSession } from "@/lib/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { globalsContent } from "@/lib/payload/content";
import { readPayloadSession } from "@/lib/session";
import { readPayloadSiteSettings } from "@/lib/payload/settings";
import { resolveAdminThemeAttrs } from "@/lib/payload/theme-attrs";
import { cookies } from "next/headers";

/**
 * The sidebar, and the one page every other one is a child of.
 *
 * Each item names the permission that decides whether it is shown, and the permission name carries
 * its operation: `pages:read` asks about a read. The item is still only a link: the page behind it
 * and the writes it reaches are both refused by the same rule, and hiding a link is not what makes
 * either of them safe.
 */
const baseNav: AdminNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/admin", label: "Overview", icon: "overview" },
      { href: "/admin/posts", label: "Posts", icon: "article", permission: PERMISSIONS.pagesRead },
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
        icon: "settings",
        permission: PERMISSIONS.settingsRead,
      },
    ],
  },
];

// The users surface is administrator-only. The shell session is already resolved in this layout,
// so the link is offered only to administrators rather than gated through the content permission
// adapter, which has no users collection of its own.
function buildNav(session: { role?: unknown }): AdminNavGroup[] {
  const nav = baseNav.map((group) => ({ ...group, items: [...group.items] }));
  if (session?.role === "admin") {
    nav.push({ label: "People", items: [
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/inbox", label: "Inbox", icon: "article" },
    ] });
    nav.push({ label: "Insights", items: [
      { href: "/admin/analytics", label: "Analytics", icon: "article" },
    ] });
    nav.push({ label: "Content", items: [
      { href: "/admin/navigation", label: "Navigation", icon: "article" },
      { href: "/admin/taxonomy", label: "Taxonomy", icon: "article" },
    ] });
  }
  return nav;
}

/**
 * The shell, on a server component, so the session it renders is the real one.
 *
 * The guard runs before anything renders. A layout cannot read the path it is rendering, so the
 * `returnTo` below is this segment's root; `proxy.ts` carries the page the visitor actually asked
 * for, and a visitor with no cookie at all never reaches here.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdminSession({ returnTo: "/admin" });
  const cookieStore = await cookies();

  let siteName: string | undefined;
  let themeSettings: { accent?: unknown; density?: unknown } = {};
  try {
    const settings = await readPayloadSiteSettings({ store: globalsContent(), resolveUser: readPayloadSession });
    themeSettings = settings;
    if (typeof settings.name === "string") {
      const name = settings.name.trim();
      // A whitespace-only stored name is not a brand label; the fallback stays.
      if (name) siteName = name;
    }
  } catch (cause) {
    // The shell still renders on a broken settings read; the fault is logged for whoever owns it.
    console.error("Failed to read the site settings for the brand label.", cause);
  }

  const nav = buildNav(session);
  return (
    <AdminFrame nav={nav} session={session} siteName={siteName}>
      <div {...resolveAdminThemeAttrs(themeSettings, cookieStore.get("helmdeck_theme")?.value === "v1:dark" ? "dark" : "light")} className="p-6 lg:p-10">{children}</div>
    </AdminFrame>
  );
}
