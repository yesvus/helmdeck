"use client";

import type { AdminResourceDefinition } from "../lib/engine/resources/registry";
import { AdminResourceForm } from "../lib/engine/resources/views";
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
