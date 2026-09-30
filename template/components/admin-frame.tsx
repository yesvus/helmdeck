"use client";

import type { ReactNode } from "react";
import {
  AdminPermissionsProvider,
  AdminShell,
  useAdminPermittedNav,
  type AdminNavGroup,
  type AdminPermissionsAdapter,
  type AdminSession,
} from "@yesvus/helmdeck";
import { checkPermissionAction } from "@/app/actions/permission-actions";
import { APP_NAME } from "@/lib/brand";

/**
 * Module scope, not inside the component: the provider drops every cached answer when the adapter's
 * identity changes, so an adapter built inline in a parent render re-asks each permission on every
 * render and never settles.
 */
const permissions: AdminPermissionsAdapter = {
  can: (permission, context) => checkPermissionAction(permission, context),
};

function PermittedNav({
  nav,
  session,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  children: ReactNode;
}) {
  // Inside the provider, because it asks it. An item with a `permission` is kept only once that
  // permission has been answered, and nothing is removed until every one of them has, so a denied
  // link is never briefly in the sidebar. The cost is an empty first paint on a nav that has a gated
  // item, which is the trade the package makes rather than one to work around here.
  const { groups } = useAdminPermittedNav(nav);

  return (
    <AdminShell nav={groups} session={session} homeHref="/admin" brand={{ label: APP_NAME, href: "/admin" }}>
      {children}
    </AdminShell>
  );
}

/**
 * The shell's client half: the permissions the sidebar asks about, and the sidebar.
 *
 * The session arrives as a prop from the layout, which resolved it on the server. A shell that
 * painted and then discovered it had no session is a flash of the wrong thing on every navigation,
 * so the resolution happens before anything renders.
 */
export function AdminFrame({
  nav,
  session,
  children,
}: {
  nav: AdminNavGroup[];
  session: AdminSession;
  children: ReactNode;
}) {
  return (
    <AdminPermissionsProvider adapter={permissions}>
      <PermittedNav nav={nav} session={session}>
        {children}
      </PermittedNav>
    </AdminPermissionsProvider>
  );
}
