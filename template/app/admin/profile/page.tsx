import { AdminProfilePage } from "@yesvus/helmdeck";
import { signOutAction } from "@/app/actions/session-actions";
import { currentAdminSession } from "@/lib/session";

/**
 * The account page the shell's profile entry points at.
 *
 * `AdminShell` points its profile entry at `${homeHref}/profile`, so mounting this is the whole of
 * the wiring: no `profileHref` prop to keep in step with a route.
 *
 * The layout above already refused anyone with no session, so the null branch renders nothing
 * rather than redirecting a second time. `sessions` is not passed and `onSignOutEverywhere` is not
 * either, so the page leaves out the controls this project cannot honour rather than rendering
 * buttons that do nothing. See the template README for the two callbacks and the row they need.
 */
export default async function ProfilePage() {
  const session = await currentAdminSession();
  if (!session) return null;

  return <AdminProfilePage session={session} onSignOut={signOutAction} />;
}
