// SPDX-License-Identifier: MIT

import { DemoResourceList } from "../../../../components/demo-resource-list";
import { shipmentsResource } from "../../../../lib/admin-resources";
import { demoPersistence } from "../../../../lib/demo-persistence";

/**
 * Shipments, generated from the resource definition.
 *
 * Two reference columns on one page, which is the case a hand-written table could not do at all: the
 * customer is printed by name, and the order is printed by the id the store holds for it because
 * orders are a resource whose rows name themselves. An editor is refused orders, so that column says
 * it is not available rather than showing an order id the visitor has no business seeing, and the
 * filter over it is not drawn at all, since a control that can only narrow to nothing is not a
 * control.
 */
export default function ShipmentsPage() {
  return (
    <DemoResourceList
      definition={shipmentsResource}
      detailBaseHref="/shell/shipments"
      paged={typeof demoPersistence().adapter.queryPage === "function"}
    />
  );
}
