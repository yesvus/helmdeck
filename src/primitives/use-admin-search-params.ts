// SPDX-License-Identifier: MIT
"use client";

import { useSearchParams } from "next/navigation.js";

export type AdminSearchParams = ReturnType<typeof useSearchParams>;

/**
 * Reads the query string for components that need it, and fails with an actionable
 * message when the page has no Suspense boundary.
 *
 * Next types this hook as always returning search params, but during static prerendering
 * without a boundary it yields nothing and the consumer sees a TypeError from an
 * unrelated property access. Naming the component and the fix here is the difference
 * between a one-line diagnosis and a debugging session.
 */
export function useAdminSearchParams(componentName: string) {
  const searchParams = useSearchParams() as AdminSearchParams | null | undefined;

  if (!searchParams) {
    throw new Error(
      `${componentName} reads the query string, so it must be rendered inside a `
      + "<Suspense> boundary when the page is statically generated. Wrap the component, "
      + `for example <Suspense fallback={null}><${componentName} /></Suspense>. `
      + "Alternatively opt the page out of static rendering with `export const dynamic = \"force-dynamic\"`.",
    );
  }

  return searchParams;
}
