"use client";

import { AdminResourceForm, type AdminResourceDefinition } from "@yesvus/helmdeck";
import { ExampleResourceListPersistence } from "@/components/resource-list";

export function ExampleResourceForm({
  definition,
  id,
}: {
  definition: AdminResourceDefinition;
  id?: string;
}) {
  return <AdminResourceForm
    definition={definition}
    persistence={ExampleResourceListPersistence}
    id={id}
    backHref={definition.path}
  />;
}
