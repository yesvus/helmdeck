// SPDX-License-Identifier: MIT
"use client";

import { useFormStatus } from "react-dom";
import { Button } from "../primitives/button.js";

export function AdminWidgetRetrySubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-busy={pending || undefined}>
      {label}
    </Button>
  );
}
