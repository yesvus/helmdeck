// SPDX-License-Identifier: MIT

/**
 * The dashboard route, over the arrangement the store holds.
 *
 * A server component, because the arrangement is rows and rows are read where the session and the
 * store both are. The page hands the resolved arrangement to the view below it, which is the half
 * that loads each tile's data: a loader per tile is a function, and a function cannot be passed from
 * a server component into a client one.
 *
 * That leaves the guard where it was rather than moving it here: the layout above is still a server
 * component, so a request without a session is redirected before this page is rendered at all.
 */

import { loadDashboardArrangementAction } from "../../../lib/demo-dashboard-arrangement";
import { DEMO_DASHBOARD } from "./name";
import DashboardView from "./view";

export default async function DashboardPage() {
  const dashboard = await loadDashboardArrangementAction(DEMO_DASHBOARD);
  return <DashboardView dashboard={dashboard} />;
}
