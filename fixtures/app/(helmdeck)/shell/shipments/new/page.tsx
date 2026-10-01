// SPDX-License-Identifier: MIT
"use client";

import { AdminResourceForm } from "@yesvus/helmdeck";
import { shipmentsResource } from "../../../../../lib/admin-resources";
import { clientPersistence } from "../../../../../lib/client-persistence";

/**
 * A new shipment, on the form the definition generates.
 *
 * The customer is a choice from the store and the order is a choice from the store, and the second
 * is a choice only for a session allowed to read orders. A visitor refused it is offered the value
 * the record already holds rather than an empty box, so a form over a resource it may not read is
 * still able to save a record whose reference points into it.
 */
export default function NewShipmentPage() {
  return (
    <AdminResourceForm
      definition={shipmentsResource}
      persistence={clientPersistence}
      backHref="/shell/shipments"
    />
  );
}
