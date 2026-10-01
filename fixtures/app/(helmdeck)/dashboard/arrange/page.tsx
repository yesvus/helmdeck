// SPDX-License-Identifier: MIT

/**
 * The arranger, over the same saved rows the dashboard renders.
 *
 * A server component for the same reason the dashboard page is one: the arrangement is read where
 * the session and the store are, and the editor below it is handed the result. The session guard
 * above this route in the segment layout covers it, so the arranger is not a second way in.
 */

import { loadDashboardArrangementAction } from "../../../../lib/demo-dashboard-arrangement";
import { DEMO_DASHBOARD } from "../name";
import DashboardArranger from "./arranger";

export default async function ArrangeDashboardPage() {
  const dashboard = await loadDashboardArrangementAction(DEMO_DASHBOARD);
  return <DashboardArranger dashboard={dashboard} />;
}
